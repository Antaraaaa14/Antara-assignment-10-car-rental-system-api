const supabase = require('../config/supabase');

const VALID_CATEGORIES = ['Sedan', 'SUV', 'Luxury', 'Hatchback', 'Electric'];
const VALID_STATUSES = ['available', 'rented', 'maintenance'];

// @desc    Fetch all vehicles with optional filters (category, status, brand, min_rate, max_rate)
// @route   GET /api/vehicles
// @access  Public
exports.getAllVehicles = async (req, res, next) => {
  try {
    const { category, status, brand, fuel_type, min_rate, max_rate } = req.query;

    let query = supabase.from('vehicles').select('*');

    if (category) {
      query = query.eq('category', category);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (brand) {
      query = query.ilike('brand', `%${brand}%`);
    }
    if (fuel_type) {
      query = query.eq('fuel_type', fuel_type);
    }
    if (min_rate) {
      query = query.gte('daily_rate', parseFloat(min_rate));
    }
    if (max_rate) {
      query = query.lte('daily_rate', parseFloat(max_rate));
    }

    // Order by newest first
    query = query.order('id', { ascending: true });

    const { data: vehicles, error } = await query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Failed to retrieve vehicles.',
        error: error.message,
      });
    }

    res.status(200).json({
      success: true,
      count: vehicles.length,
      data: vehicles,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single vehicle details along with past rental records
// @route   GET /api/vehicles/:id
// @access  Public
exports.getVehicleById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Relational join with rentals
    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .select('*, rentals(*)')
      .eq('id', id)
      .single();

    if (error || !vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${id} not found.`,
      });
    }

    res.status(200).json({
      success: true,
      data: vehicle,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add new vehicle to fleet
// @route   POST /api/vehicles
// @access  Private (Authenticated / Admin)
exports.createVehicle = async (req, res, next) => {
  try {
    const {
      brand,
      model,
      year,
      category,
      daily_rate,
      fuel_type,
      seating_capacity = 5,
      status = 'available',
    } = req.body;

    if (!brand || !model || !year || !category || daily_rate === undefined || !fuel_type) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: brand, model, year, category, daily_rate, fuel_type.',
      });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    if (parseFloat(daily_rate) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'daily_rate must be a positive number greater than 0.',
      });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const { data, error } = await supabase
      .from('vehicles')
      .insert([
        {
          brand,
          model,
          year: parseInt(year, 10),
          category,
          daily_rate: parseFloat(daily_rate),
          fuel_type,
          seating_capacity: parseInt(seating_capacity, 10),
          status,
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Failed to add vehicle to fleet.',
        error: error.message,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Vehicle added successfully to fleet.',
      data,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update vehicle daily rate or status
// @route   PUT /api/vehicles/:id
// @access  Private
exports.updateVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = {};
    const allowedFields = ['brand', 'model', 'year', 'category', 'daily_rate', 'fuel_type', 'seating_capacity', 'status'];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one valid field to update.',
      });
    }

    if (updates.category && !VALID_CATEGORIES.includes(updates.category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    if (updates.daily_rate !== undefined && parseFloat(updates.daily_rate) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'daily_rate must be greater than 0.',
      });
    }

    const { data, error } = await supabase
      .from('vehicles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${id} not found or failed to update.`,
        error: error ? error.message : undefined,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Vehicle updated successfully.',
      data,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete vehicle from fleet (Checks for active/booked rentals)
// @route   DELETE /api/vehicles/:id
// @access  Private
exports.deleteVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if vehicle exists
    const { data: vehicle, error: fetchErr } = await supabase
      .from('vehicles')
      .select('id, brand, model')
      .eq('id', id)
      .single();

    if (fetchErr || !vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with ID ${id} not found.`,
      });
    }

    // Check if vehicle has active or booked reservations
    const { data: activeRentals, error: rentalErr } = await supabase
      .from('rentals')
      .select('id, status')
      .eq('vehicle_id', id)
      .in('status', ['booked', 'active']);

    if (rentalErr) {
      return res.status(500).json({
        success: false,
        message: 'Error verifying vehicle rental status.',
        error: rentalErr.message,
      });
    }

    if (activeRentals && activeRentals.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete vehicle: It has ${activeRentals.length} active or booked reservation(s).`,
      });
    }

    // Proceed to delete vehicle
    const { error: deleteErr } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      return res.status(400).json({
        success: false,
        message: 'Failed to delete vehicle.',
        error: deleteErr.message,
      });
    }

    res.status(200).json({
      success: true,
      message: `Vehicle ${vehicle.brand} ${vehicle.model} (ID: ${id}) deleted successfully from fleet.`,
    });
  } catch (error) {
    next(error);
  }
};
