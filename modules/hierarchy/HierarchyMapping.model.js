const mongoose = require('mongoose');

const hierarchyMappingSchema = new mongoose.Schema({
    empId: {
        type: String,
        trim: true,
        required: true,
        unique: true
    },
    roleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role',
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('HierarchyMapping', hierarchyMappingSchema);
