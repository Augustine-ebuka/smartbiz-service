import { Product, IProduct, ProductType } from '../models/product.model';

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

}

export default new ProductService();