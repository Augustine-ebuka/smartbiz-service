import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../config/Apperror';
import {
  createVendor,
  deleteVendor,
  getVendorById,
  listVendors,
  updateVendor,
} from '../services/vendor.service';

const handleControllerError = (error: unknown, res: Response, next: NextFunction): void => {
  if (error instanceof NotFoundError) {
    res.status(404).json({ success: false, error: error.message });
    return;
  }
  next(error);
};

/**
 * POST /vendors
 * Body: { name, contactPerson?, category?, email?, phone?, address?,
 *         taxId?, paymentTerms?, bankDetails?, website?, notes? }
 */
export const createVendorHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      name,
      contactPerson,
      category,
      email,
      phone,
      address,
      taxId,
      paymentTerms,
      bankDetails,
      website,
      notes,
    } = req.body ?? {};

    if (!name || typeof name !== 'string') {
      res.status(400).json({ success: false, error: 'name (vendor/business name) is required' });
      return;
    }

    const vendor = await createVendor({
      name,
      contactPerson,
      category,
      email,
      phone,
      address,
      taxId,
      paymentTerms,
      bankDetails,
      website,
      notes,
    });

    res.status(201).json({ success: true, data: vendor });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

/** GET /vendors?category=Supplies&name=acme */
export const listVendorsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { category, name } = req.query;

    const vendors = await listVendors({
      category: typeof category === 'string' ? category : undefined,
      name: typeof name === 'string' ? name : undefined,
    });

    res.status(200).json({ success: true, data: vendors });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

/** GET /vendors/:id */
export const getVendorHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const vendor = await getVendorById(req.params.id);
    res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

/** PATCH /vendors/:id — any subset of the create fields */
export const updateVendorHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const vendor = await updateVendor(req.params.id, req.body ?? {});
    res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

/** DELETE /vendors/:id */
export const deleteVendorHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await deleteVendor(req.params.id);
    res.status(200).json({ success: true, message: 'Vendor deleted successfully' });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};
