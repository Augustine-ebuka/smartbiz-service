import { AnyAaaaRecord } from 'node:dns';
import { Product, IProduct, ProductType } from '../models/product.model';
import { User } from '../models/user.model';
import ApiError from '../utils/ApiError';
import activityLogService from './activityLogService';
import { generateUniqueStoreSlug } from '../utils/slugify';

async function getActorInfo(userId: string): Promise<{ actorName: string; actorRole: string }> {
  const actor = await User.findById(userId).select('firstName lastName role');
  return {
    actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'Unknown',
    actorRole: actor?.role ?? 'unknown',
  };
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateProductDTO {
  name: string;
  type: ProductType;
  price: number;
  costPrice?: number;
  description?: string;
  barcode?: string;
}

export type UpdateProductDTO = Partial<CreateProductDTO>;

// ─── Service ──────────────────────────────────────────────────────────────────

class ProductService {

  async create(userId: string, payload: CreateProductDTO, actorId?: string): Promise<IProduct> {
    const product = new Product({ userId, ...payload });
    let saved: IProduct;
    try {
      saved = await product.save();
    } catch (error: any) {
      if (error?.code === 11000 && error?.keyPattern?.barcode) {
        throw new ApiError(409, `A product with barcode "${payload.barcode}" already exists.`);
      }
      throw error;
    }

    const { actorName, actorRole } = await getActorInfo(actorId ?? userId);
    await activityLogService.log({
      businessOwnerId: userId,
      actorId: actorId ?? userId,
      actorName,
      actorRole,
      action: 'product.create',
      description: `Product "${saved.name}" created`,
      resourceId: saved._id,
      amount: saved.price,
    });

    return saved;
  }

  async getAll(
  userId: string,
  page = 1,
  limit = 20,
  search?: string,
  type?: 'Good' | 'Service'
): Promise<{ products: IProduct[]; total: number; page: number; totalPages: number }> {
  const query: Record<string, any> = { userId };

  if (search) {
    query.$or = [
      { name:        { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  if (type) query.type = type;

  const skip  = (page - 1) * limit;
  const total = await Product.countDocuments(query);

  const products = await Product.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    products,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

  async getById(userId: string, productId: string): Promise<IProduct> {
    const product = await Product.findOne({ _id: productId, userId });
    if (!product) throw new Error('Product not found.');
    return product;
  }

  async update(userId: string, productId: string, payload: UpdateProductDTO, actorId?: string): Promise<IProduct> {
    let product;
    try {
      product = await Product.findOneAndUpdate(
        { _id: productId, userId },
        { $set: payload },
        { new: true, runValidators: true }
      );
    } catch (error: any) {
      if (error?.code === 11000 && error?.keyPattern?.barcode) {
        throw new ApiError(409, `A product with barcode "${payload.barcode}" already exists.`);
      }
      throw error;
    }
    if (!product) throw new Error('Product not found.');

    const { actorName, actorRole } = await getActorInfo(actorId ?? userId);
    await activityLogService.log({
      businessOwnerId: userId,
      actorId: actorId ?? userId,
      actorName,
      actorRole,
      action: 'product.update',
      description: `Product "${product.name}" updated`,
      resourceId: product._id,
      amount: product.price,
    });

    return product;
  }

  async delete(userId: string, productId: string, actorId?: string): Promise<void> {
    const result = await Product.findOneAndDelete({ _id: productId, userId });
    if (!result) throw new Error('Product not found.');

    const { actorName, actorRole } = await getActorInfo(actorId ?? userId);
    await activityLogService.log({
      businessOwnerId: userId,
      actorId: actorId ?? userId,
      actorName,
      actorRole,
      action: 'product.delete',
      description: `Product "${result.name}" deleted`,
      resourceId: productId,
      amount: result.price,
    });
  }

  // public product of a business owner — looked up by either the raw userId
  // (legacy /store/:id links keep working) or the friendlier storeSlug.
  async getPublicProducts(identifier: { userId?: string; slug?: string }): Promise<any> {
    if (!identifier.userId && !identifier.slug) throw new Error('userId or slug is required.');

    const businessOwner = identifier.slug
      ? await User.findOne({ 'settings.companyProfile.storeSlug': identifier.slug })
      : await User.findOne({ _id: identifier.userId });
    if (!businessOwner) throw new Error('User not found.');


    if (businessOwner) {
      // Ensure nested objects exist before assigning
      if (!businessOwner.settings) {
        businessOwner.settings = {};
      }
      if (!businessOwner.settings.companyProfile) {
        businessOwner.settings.companyProfile = {};
      }

      // check if merchant status is true
      if (!businessOwner.settings.companyProfile.merchantStatus) throw new Error('User is not a merchant.');

      // Backfill a slug for merchants who became one before storeSlug existed,
      // so every store gets a friendly URL without a migration script.
      if (!businessOwner.settings.companyProfile.storeSlug) {
        const nameSource = businessOwner.settings.companyProfile.businessName || `${businessOwner.firstName}'s Business`;
        businessOwner.settings.companyProfile.storeSlug = await generateUniqueStoreSlug(nameSource, businessOwner._id.toString());
        businessOwner.markModified('settings.companyProfile');
        await businessOwner.save();
      }

      // return public products
      const products = await Product.find({ userId: businessOwner._id, isPublic: true }).sort({ createdAt: -1 });
      // return business info and products info
      return {
        businessOwner: businessOwner.settings.companyProfile,
        products,
      };
    }


    }

  // Lets a merchant customize their /store/<slug> URL. Normalizes whatever
  // they type into a URL-safe slug and appends -2/-3/... if it's taken by
  // someone else, rather than rejecting the request outright.
  async updateStoreSlug(userId: string, desiredSlug: string): Promise<string> {
    if (!desiredSlug || !desiredSlug.trim()) throw new ApiError(400, 'A store name is required.');

    const slug = await generateUniqueStoreSlug(desiredSlug, userId);

    const businessOwner = await User.findByIdAndUpdate(
      userId,
      { $set: { 'settings.companyProfile.storeSlug': slug } },
      { new: true, runValidators: true }
    );
    if (!businessOwner) throw new Error('User not found.');

    return slug;
  }

  async togglePublic(userId: string, products: string[]): Promise<void> {
  if (!products || products.length === 0) {
    throw new Error('No product IDs provided.');
  }

  // Verify all products exist and belong to this user before touching anything
  const existingProducts = await Product.find({
    _id: { $in: products },
    userId,
  }).select('_id');

  if (existingProducts.length === 0) {
    throw new Error('No matching products found.');
  }

  // Warn if some IDs were not found or don't belong to this user
  if (existingProducts.length !== products.length) {
    const foundIds = existingProducts.map(p => p._id.toString());
    const missing  = products.filter(id => !foundIds.includes(id));
    throw new Error(`Some products were not found or do not belong to you: ${missing.join(', ')}`);
  }

  // Atomically toggle each — $not flips the boolean in one DB operation
  // No race condition since we're not reading then writing the value
  await Product.bulkWrite(
    existingProducts.map(product => ({
      updateOne: {
        filter: { _id: product._id, userId },
        update: [{ $set: { isPublic: { $not: '$isPublic' } } }],  // ← pipeline update
      },
    }))
  );
}
}

export default new ProductService();
