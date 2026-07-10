import { Request, Response } from "express";
import * as FeeService from "../services/competitorService";

/**
 * Create
 */
export const createFeeConfig = async (req: Request, res: Response) => {
  try {
    const data = await FeeService.createFeeConfig(req.body);

    res.status(201).json({
      success: true,
      message: "Fee config created successfully",
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create fee config",
    });
  }
};

/**
 * Get All
 */
export const getAllFeeConfigs = async (_req: Request, res: Response) => {
  try {
    const data = await FeeService.getAllFeeConfigs();

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch fee configs",
    });
  }
};

/**
 * Get One
 */
export const getFeeConfigById = async (req: Request, res: Response) => {
  try {
    const data = await FeeService.getFeeConfigById(req.params.id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Fee config not found",
      });
    }

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch fee config",
    });
  }
};

/**
 * Update
 */
export const updateFeeConfig = async (req: Request, res: Response) => {
  try {
    const data = await FeeService.updateFeeConfig(
      req.params.id,
      req.body
    );

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Fee config not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Fee config updated successfully",
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update fee config",
    });
  }
};

/**
 * Delete
 */
export const deleteFeeConfig = async (req: Request, res: Response) => {
  try {
    const deleted = await FeeService.deleteFeeConfig(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Fee config not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Fee config deleted successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete fee config",
    });
  }
};