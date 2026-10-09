import mongoose from 'mongoose';

const shuttleSchema = new mongoose.Schema(
  {
    plateNumber: {
      type: String,
      sparse: true,
      unique: true, // Enforces vehicle uniqueness across the fleet registry 
      trim: true,
    },
    model: {
      type: String, 
      trim: true,
    },
    capacity: {
      type: Number,
      required: true, // Total passenger seats available on the vehicle 
    },
    status: {
      type: String,
      enum: ['active', 'maintenance'], // State constraints for operational loops 
      default: 'active',
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt fields for verification audits
  }
);

const Shuttle = mongoose.model('Shuttle', shuttleSchema);

export default Shuttle;