import { AnyAaaaRecord } from 'node:dns';
import { Product, IProduct, ProductType } from '../models/product.model';
import { User } from '../models/user.model';
// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateProductDTO {
  name: string;
  type: ProductType;
  price: number;
  description?: string;
}

export type UpdateProductDTO = Partial<CreateProductDTO>;

// ─── Service ──────────────────────────────────────────────────────────────────

class ProductService {

  async create(userId: string, payload: CreateProductDTO): Promise<IProduct> {
    const product = new Product({ userId, ...payload });
    return product.save();
  }

  async getAll(userId: string): Promise<IProduct[]> {
    return Product.find({ userId }).sort({ createdAt: -1 });
  }

  async getById(userId: string, productId: string): Promise<IProduct> {
    const product = await Product.findOne({ _id: productId, userId });
    if (!product) throw new Error('Product not found.');
    return product;
  }

  async update(userId: string, productId: string, payload: UpdateProductDTO): Promise<IProduct> {
    const product = await Product.findOneAndUpdate(
      { _id: productId, userId },
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!product) throw new Error('Product not found.');
    return product;
  }

  async delete(userId: string, productId: string): Promise<void> {
    const result = await Product.findOneAndDelete({ _id: productId, userId });
    if (!result) throw new Error('Product not found.');
  }

  // public product of a business ownwer
  async getPublicProducts(userId: string): Promise<any> {

    // check user
    const businessOwner = await User.findOne({ _id: userId }); 
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

      // return public products
      const products = await Product.find({ userId: businessOwner._id, isPublic: true }).sort({ createdAt: -1 });
      // return business info and products info
      return {
        businessOwner: businessOwner.settings.companyProfile,
        products,
      };
    }

  
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
