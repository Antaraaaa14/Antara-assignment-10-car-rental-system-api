const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const authenticateToken = require('../middleware/auth');

// Public routes
router.get('/', vehicleController.getAllVehicles);
router.get('/:id', vehicleController.getVehicleById);

// Protected routes (Admin / Management)
router.post('/', authenticateToken, vehicleController.createVehicle);
router.put('/:id', authenticateToken, vehicleController.updateVehicle);
router.delete('/:id', authenticateToken, vehicleController.deleteVehicle);

module.exports = router;
