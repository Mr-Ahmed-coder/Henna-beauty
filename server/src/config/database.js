import mongoose from "mongoose";
export async function connectDatabase(uri) {
  if (!uri) return false;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return true;
}
