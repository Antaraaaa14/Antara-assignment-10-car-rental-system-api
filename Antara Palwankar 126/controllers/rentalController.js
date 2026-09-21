const supabase = require('../config/supabase');

// Helper to validate date string YYYY-MM-DD
const isValidDate = (dateStr) => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
};

// @desc    Book a vehicle with complex date collision checks & automatic cost calculation
// @route   POST /api/rentals
// @access  Private (Authenticated)
exports.createRental = async (req, res, next) => {
  try {
    const { vehicle_id, start_date, end_date, customer_name, customer_email } = req.body;
    const userId = req.user.id;

    // 1. Validation
    if (!vehicle_id || !start_date || !end_date || !customer_name || !customer_email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required booking fields: vehicle_id, start_date, end_date, customer_name, customer_email.',
      });
    }

    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Dates must be in YYYY-MM-DD format.',
      });
    }

    const startDateObj = new Date(start_date);
    const endDateObj = new Date(end_date);

    if (endDateObj < startDateObj) {
      return res.status(400).json({
        success: false,
        message: 'end_date cannot be earlier than start_date.',
      });
    }

    // 2. Fetch vehicle details
    const { data: vehicle, error: vehicleErr } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', vehicle_id)
      .single();

    if (vehicleErr || !vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${vehicle_id} not found.`,
      });
    }

    if (vehicle.status === 'maintenance') {
      return res.status(400).json({
        success: false,
        message: `Vehicle ${vehicle.brand} ${vehicle.model} is currently under maintenance and cannot be booked.`,
      });
    }

    // 3. Collision Detection (Overlap Check)
    // Overlap condition: existing.start_date <= requested.end_date AND existing.end_date >= requested.start_date
    const { data: collisions, error: collisionErr } = await supabase
      .from('rentals')
      .select('id, start_date, end_date, status')
      .eq('vehicle_id', vehicle_id)
      .in('status', ['booked', 'active'])
      .lte('start_date', end_date)
      .gte('end_date', start_date);

    if (collisionErr) {
      return res.status(500).json({
        success: false,
        message: 'Error verifying date availability for this vehicle.',
        error: collisionErr.message,
      });
    }

    if (collisions && collisions.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle already reserved during this timeframe.',
        conflict: collisions[0],
      });
    }

    // 4. Calculate day span and total cost
    const diffTime = endDateObj.getTime() - startDateObj.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive rental days
    const totalDays = Math.max(1, diffDays);
    const totalCost = Number((totalDays * vehicle.daily_rate).toFixed(2));

    // 5. Insert Rental Record
    const { data: newRental, error: insertErr } = await supabase
      .from('rentals')
      .insert([
        {
          user_id: userId,
          vehicle_id: parseInt(vehicle_id, 10),
          customer_name,
          customer_email,
          start_date,
          end_date,
          total_cost: totalCost,
          status: 'booked',
        },
      ])
      .select('*, vehicles(*)')
      .single();

    if (insertErr) {
      return res.status(400).json({
        success: false,
        message: 'Failed to create rental reservation.',
        error: insertErr.message,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Vehicle booked successfully.',
      calculation: {
        daily_rate: vehicle.daily_rate,
        total_days: totalDays,
        total_cost: totalCost,
      },
      data: newRental,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    List all rentals for the currently authenticated user
// @route   GET /api/rentals/my-bookings
// @access  Private (Authenticated)
exports.getMyBookings = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { data: bookings, error } = await supabase
      .from('rentals')
      .select('*, vehicles(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Failed to fetch your bookings.',
        error: error.message,
      });
    }

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel upcoming rental
// @route   PATCH /api/rentals/:id/cancel
// @access  Private (Authenticated)
exports.cancelRental = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Fetch rental
    const { data: rental, error: fetchErr } = await supabase
      .from('rentals')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !rental) {
      return res.status(404).json({
        success: false,
        message: `Rental record with ID ${id} not found.`,
      });
    }

    // Check ownership
    if (rental.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You can only cancel your own bookings.',
      });
    }

    if (rental.status !== 'booked') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel rental with status '${rental.status}'. Only 'booked' reservations can be cancelled.`,
      });
    }

    // Update rental status to cancelled
    const { data: updatedRental, error: updateErr } = await supabase
      .from('rentals')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      return res.status(400).json({
        success: false,
        message: 'Failed to cancel rental.',
        error: updateErr.message,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Rental reservation cancelled successfully.',
      data: updatedRental,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark car as returned / complete rental and set vehicle back to available
// @route   PATCH /api/rentals/:id/complete
// @access  Private (Authenticated)
exports.completeRental = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch rental
    const { data: rental, error: fetchErr } = await supabase
      .from('rentals')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !rental) {
      return res.status(404).json({
        success: false,
        message: `Rental record with ID ${id} not found.`,
      });
    }

    if (rental.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Rental is already completed.',
      });
    }

    if (rental.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot complete a cancelled rental.',
      });
    }

    // 1. Update rental status to completed
    const { data: updatedRental, error: updateRentalErr } = await supabase
      .from('rentals')
      .update({ status: 'completed' })
      .eq('id', id)
      .select()
      .single();

    if (updateRentalErr) {
      return res.status(400).json({
        success: false,
        message: 'Failed to update rental status.',
        error: updateRentalErr.message,
      });
    }

    // 2. Update vehicle status back to 'available'
    const { error: updateVehicleErr } = await supabase
      .from('vehicles')
      .update({ status: 'available' })
      .eq('id', rental.vehicle_id);

    if (updateVehicleErr) {
      console.error('Warning: Failed to update vehicle status to available:', updateVehicleErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Rental marked as completed and vehicle restored to available status.',
      data: updatedRental,
    });
  } catch (error) {
    next(error);
  }
};
