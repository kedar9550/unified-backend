const Building = require('./Building.model');
const Floor = require('./Floor.model');
const Ground = require('./Ground.model');

// --- Buildings ---
exports.createBuilding = async (req, res) => {
    try {
        const { name, status } = req.body;
        const newBuilding = await Building.create({ name, status });
        res.status(201).json({ success: true, data: newBuilding });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.getBuildings = async (req, res) => {
    try {
        const buildings = await Building.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: buildings });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateBuilding = async (req, res) => {
    try {
        const { id } = req.params;
        const building = await Building.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        if (!building) {
            return res.status(404).json({ success: false, message: 'Building not found' });
        }
        res.status(200).json({ success: true, data: building });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteBuilding = async (req, res) => {
    try {
        const { id } = req.params;
        const building = await Building.findByIdAndDelete(id);
        if (!building) {
            return res.status(404).json({ success: false, message: 'Building not found' });
        }
        res.status(200).json({ success: true, message: 'Building deleted successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// --- Floors ---
exports.createFloor = async (req, res) => {
    try {
        const { name, status } = req.body;
        const newFloor = await Floor.create({ name, status });
        res.status(201).json({ success: true, data: newFloor });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.getFloors = async (req, res) => {
    try {
        const floors = await Floor.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: floors });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateFloor = async (req, res) => {
    try {
        const { id } = req.params;
        const floor = await Floor.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        if (!floor) {
            return res.status(404).json({ success: false, message: 'Floor not found' });
        }
        res.status(200).json({ success: true, data: floor });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteFloor = async (req, res) => {
    try {
        const { id } = req.params;
        const floor = await Floor.findByIdAndDelete(id);
        if (!floor) {
            return res.status(404).json({ success: false, message: 'Floor not found' });
        }
        res.status(200).json({ success: true, message: 'Floor deleted successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// --- Grounds ---
exports.createGround = async (req, res) => {
    try {
        const { name, status } = req.body;
        const newGround = await Ground.create({ name, status });
        res.status(201).json({ success: true, data: newGround });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.getGrounds = async (req, res) => {
    try {
        const grounds = await Ground.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: grounds });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateGround = async (req, res) => {
    try {
        const { id } = req.params;
        const ground = await Ground.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        if (!ground) {
            return res.status(404).json({ success: false, message: 'Ground not found' });
        }
        res.status(200).json({ success: true, data: ground });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteGround = async (req, res) => {
    try {
        const { id } = req.params;
        const ground = await Ground.findByIdAndDelete(id);
        if (!ground) {
            return res.status(404).json({ success: false, message: 'Ground not found' });
        }
        res.status(200).json({ success: true, message: 'Ground deleted successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
