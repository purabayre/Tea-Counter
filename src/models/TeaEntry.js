const mongoose = require("mongoose");

const teaEntrySchema = new mongoose.Schema(
  {
    date_time: {
      type: Date,
      required: true,
      default: Date.now,
    },

    date: {
      type: String,
      required: true,
    },

    time: {
      type: String,
      required: true,
    },

    cup_count: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Cup count must be a whole number",
      },
    },

    price_per_cup: {
      type: Number,
      required: true,
      min: [1, "Price must be greater than 0"], // ✅ FIX
    },

    total: {
      type: Number,
      required: true,
    },

    month: {
      type: Number,
      required: true,
    },

    year: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("TeaEntry", teaEntrySchema);
