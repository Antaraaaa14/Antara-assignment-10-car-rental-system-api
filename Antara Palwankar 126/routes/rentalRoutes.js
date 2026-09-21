const express = require('express');
const router = express.Router();
const rentalController = require('../controllers/rentalController');
const authenticateToken = require('../middleware/auth');

// All rental routes are protected with Supabase Auth
router.use(authenticateToken);

// Create new booking with collision check & day calculation
router.post('/', rentalController.createRental);

// List authenticated customer's bookings
router.get('/my-bookings', rentalController.getMyBookings);

// Cancel upcoming booking
router.patch('/:id/cancel', rentalController.cancelRental);

// Complete booking & mark vehicle available
router.patch('/:id/complete', rentalController.completeRental);

module.exports = router;
