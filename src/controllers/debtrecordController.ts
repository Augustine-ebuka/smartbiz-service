import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../config/Apperror';
import { DEBT_TYPES, DebtType } from '../models/debtrecord';
import {
  createDebtRecord,
  deleteDebtRecord,
  getDebtRecordById,
  listDebtRecords,
  updateDebtRecord,
  markDebtRecordAsPaid,
} from '../services/debtrecordService';

const isValidDebtType = (value: unknown): value is DebtType =>
  typeof value === 'string' && (DEBT_TYPES as readonly string[]).includes(value);

/**
 * Sends a 404 for a NotFoundError; delegates everything else to the
 * generic error middleware. Keeps each handler's catch block a one-liner.
 */
const handleControllerError = (error: unknown, res: Response, next: NextFunction): void => {
  if (error instanceof NotFoundError) {
    res.status(404).json({ success: false, error: error.message });
    return;
  }
  next(error);
};

/**
 * POST /debt-records
 * Body: { type, amount, customer, dueDate?, description? }
 */
export const createDebtRecordHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { type, amount, customer, dueDate, description } = req.body ?? {};
    const userId = (req as any).businessOwnerId as string || '';
      if (!userId) {
        throw new Error('Business owner ID is required.');
      }

      console.log(userId);
    
    if (!isValidDebtType(type)) {
      res.status(400).json({
        success: false,
        error: `type must be one of: ${DEBT_TYPES.join(', ')}`,
      });
      return;
    }

    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ success: false, error: 'amount must be a positive number' });
      return;
    }

    if (!customer || typeof customer !== 'string') {
      res.status(400).json({ success: false, error: 'customer is required' });
      return;
    }

    const record = await createDebtRecord({
      type,
      amount,
      customer,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      description,
      userId,
    });

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

/**
 * GET /debt-records?type=THEY_OWE_ME&customer=jane
 * Both filters are optional; customer is a case-insensitive partial match.
 */
export const listDebtRecordsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { type, customer } = req.query;
    const userId = (req as any).businessOwnerId as string || '';
      if (!userId) {
        throw new Error('Business owner ID is required.');
      }

    if (type !== undefined && !isValidDebtType(type)) {
      res.status(400).json({
        success: false,
        error: `type must be one of: ${DEBT_TYPES.join(', ')}`,
      });
      return;
    }

    const records = await listDebtRecords({
      type: isValidDebtType(type) ? type : undefined,
      customer: typeof customer === 'string' ? customer : undefined,
    });

    res.status(200).json({ success: true, data: records });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

/** GET /debt-records/:id */
export const getDebtRecordHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as any).businessOwnerId as string || '';
      if (!userId) {
        throw new Error('Business owner ID is required.');
      }
    const record = await getDebtRecordById(req.params.id);
    res.status(200).json({ success: true, data: record });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

/**
 * PATCH /debt-records/:id
 * Body: any subset of { type, amount, customer, dueDate, description }
 */
export const updateDebtRecordHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {

    const userId = (req as any).businessOwnerId as string || '';
      if (!userId) {
        throw new Error('Business owner ID is required.');
      }
    const { type, amount, customer, dueDate, description } = req.body ?? {};

    if (type !== undefined && !isValidDebtType(type)) {
      res.status(400).json({
        success: false,
        error: `type must be one of: ${DEBT_TYPES.join(', ')}`,
      });
      return;
    }

    if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
      res.status(400).json({ success: false, error: 'amount must be a positive number' });
      return;
    }

    const record = await updateDebtRecord(req.params.id, {
      ...(type !== undefined && { type }),
      ...(amount !== undefined && { amount }),
      ...(customer !== undefined && { customer }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : undefined }),
      ...(description !== undefined && { description }),
    });

    res.status(200).json({ success: true, data: record });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

/** DELETE /debt-records/:id */
export const deleteDebtRecordHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
     const userId = (req as any).businessOwnerId as string || '';
      if (!userId) {
        throw new Error('Business owner ID is required.');
      }
    await deleteDebtRecord(req.params.id);
    res.status(200).json({ success: true, message: 'Debt record deleted successfully' });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

export const markAsPaidHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as any).businessOwnerId as string || '';
      if (!userId) {
        throw new Error('Business owner ID is required.');
      }
    await markDebtRecordAsPaid(req.params.id, userId);
    res.status(200).json({ success: true, message: 'Debt record marked as paid successfully' });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};