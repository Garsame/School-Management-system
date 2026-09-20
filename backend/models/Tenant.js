const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  domain: { type: String, required: true, unique: true },
  logoUrl: { type: String },
  primaryColor: { type: String, default: "#3b82f6" },
  secondaryColor: { type: String, default: "#1e40af" },
  plan: {
    type: String,
    default: "basic",
  },
  billingContactEmail: { type: String, trim: true, lowercase: true },
  subscription: {
    billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
    status: {
      type: String,
      enum: ["pending", "active", "past_due", "suspended", "cancelled"],
      default: "pending",
    },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    nextBillingDate: { type: Date },
    gracePeriodEndsAt: { type: Date },
  },
  status: {
    type: String,
    enum: ["pending", "active", "rejected", "suspended"],
    default: "pending",
    index: true,
  },
  statusHistory: [{
    status: { type: String, enum: ["pending", "active", "rejected", "suspended"], required: true },
    reason: { type: String, trim: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    changedAt: { type: Date, default: Date.now },
  }],
  subscriptionLimits: {
      maxBranches: { type: Number, default: 1 },
      maxUsers: { type: Number, default: 10 },
      maxStudents: { type: Number, default: 50 },
      storageLimit: { type: String, default: "5GB" }
  },
  isActive: { type: Boolean, default: false },
  isApproved: { type: Boolean, default: false },
}, { timestamps: true });

tenantSchema.pre("validate", function() {
  if (!this.isModified("status") && this.status === "pending" && this.isApproved === true) {
    this.status = this.isActive ? "active" : "suspended";
  }
  if (!this.isModified("status") && this.isNew) {
    if (this.isApproved && this.isActive) this.status = "active";
    else if (this.isApproved && !this.isActive) this.status = "suspended";
    else this.status = "pending";
  }

  if (this.status === "active") {
    this.isApproved = true;
    this.isActive = true;
  } else if (this.status === "suspended") {
    this.isApproved = true;
    this.isActive = false;
  } else {
    this.isApproved = false;
    this.isActive = false;
  }
});

module.exports = mongoose.model("Tenant", tenantSchema);
