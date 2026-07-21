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
      const products = await Product.find({ userId: businessOwner._id}).sort({ createdAt: -1 });
      // return business info and products info
      return {
        businessOwner: businessOwner.settings.companyProfile,
        products,
      };
    }

  
    }
    
  }

export default new ProductService();