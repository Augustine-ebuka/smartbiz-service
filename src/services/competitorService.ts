import { FeeConfig, IFeeConfig } from "../models/competitors.model";

/**
 * Create Fee Config
 */
export const createFeeConfig = async (
  payload: Partial<IFeeConfig>
): Promise<IFeeConfig> => {
  const config = await FeeConfig.create(payload);
  return config;
};

/**
 * Get All Fee Configs
 */
export const getAllFeeConfigs = async (): Promise<IFeeConfig[]> => {
  return await FeeConfig.find().sort({ createdAt: -1 });
};

/**
 * Get Single Fee Config
 */
export const getFeeConfigById = async (
  id: string
): Promise<IFeeConfig | null> => {
  return await FeeConfig.findById(id);
};

/**
 * Update Fee Config
 */
export const updateFeeConfig = async (
  id: string,
  payload: Partial<IFeeConfig>
): Promise<IFeeConfig | null> => {
  return await FeeConfig.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
};

/**
 * Delete Fee Config
 */
export const deleteFeeConfig = async (id: string): Promise<boolean> => {
  const result = await FeeConfig.findByIdAndDelete(id);
  return !!result;
};