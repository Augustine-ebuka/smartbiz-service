import { ProductCategory, IProductCategory } from '../models/productCategory.model';
import ApiError from '../utils/ApiError';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateProductCategoryDTO {
  name: string;
}

export type UpdateProductCategoryDTO = Partial<CreateProductCategoryDTO>;

// A broad, generic set of categories covering most small-business
// storefronts (retail, food, services) — seeded once on server startup so
// every business has a sensible starting list without having to build one
// from scratch.
export const SYSTEM_PRODUCT_CATEGORIES: string[] = [
  'Electronics',
  'Fashion & Apparel',
  'Groceries & Food',
  'Health & Beauty',
  'Home & Kitchen',
  'Books & Stationery',
  'Toys & Games',
  'Sports & Outdoors',
  'Automotive',
  'Furniture',
  'Jewelry & Accessories',
  'Baby Products',
  'Pet Supplies',
  'Office Supplies',
  'Phones & Accessories',
  'Computers & Accessories',
  'Services',
  'Other',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Service ──────────────────────────────────────────────────────────────────

class ProductCategoryService {

  async create(userId: string, payload: CreateProductCategoryDTO): Promise<IProductCategory> {
    const name = payload.name?.trim();
    if (!name) throw new ApiError(400, 'Category name is required.');

    const existing = await ProductCategory.findOne({
      $or: [
        { userId, name: { $regex: `^${escapeRegExp(name)}$`, $options: 'i' } },
        { system: true, name: { $regex: `^${escapeRegExp(name)}$`, $options: 'i' } },
      ],
    });
    if (existing) throw new ApiError(409, `Category "${name}" already exists.`);

    const category = new ProductCategory({ userId, name });
    return category.save();
  }

  // Every business sees the shared built-in categories plus their own custom ones.
  async getAll(userId: string): Promise<IProductCategory[]> {
    return ProductCategory.find({ $or: [{ userId }, { system: true }] })
      .sort({ system: -1, name: 1 });
  }

  async getById(userId: string, categoryId: string): Promise<IProductCategory> {
    const category = await ProductCategory.findOne({
      _id: categoryId,
      $or: [{ userId }, { system: true }],
    });
    if (!category) throw new ApiError(404, 'Product category not found.');
    return category;
  }

  async update(userId: string, categoryId: string, payload: UpdateProductCategoryDTO): Promise<IProductCategory> {
    const category = await ProductCategory.findById(categoryId);
    if (!category) throw new ApiError(404, 'Product category not found.');
    if (category.system) throw new ApiError(403, 'Built-in categories cannot be modified.');
    if (category.userId !== userId) throw new ApiError(403, 'You do not have permission to modify this category.');

    const name = payload.name?.trim();
    if (name) {
      const existing = await ProductCategory.findOne({
        _id: { $ne: categoryId },
        $or: [
          { userId, name: { $regex: `^${escapeRegExp(name)}$`, $options: 'i' } },
          { system: true, name: { $regex: `^${escapeRegExp(name)}$`, $options: 'i' } },
        ],
      });
      if (existing) throw new ApiError(409, `Category "${name}" already exists.`);
      category.name = name;
    }

    await category.save();
    return category;
  }

  async delete(userId: string, categoryId: string): Promise<void> {
    const category = await ProductCategory.findById(categoryId);
    if (!category) throw new ApiError(404, 'Product category not found.');
    if (category.system) throw new ApiError(403, 'Built-in categories cannot be deleted.');
    if (category.userId !== userId) throw new ApiError(403, 'You do not have permission to delete this category.');

    await category.deleteOne();
  }

  // ── Seeding ────────────────────────────────────────────────────────────────
  // Idempotent — safe to call on every server start. Uses upsert so it never
  // duplicates or errors out if the categories already exist.
  async seedSystemCategories(): Promise<void> {
    await Promise.all(
      SYSTEM_PRODUCT_CATEGORIES.map((name) =>
        ProductCategory.updateOne(
          { system: true, name },
          { $setOnInsert: { name, system: true } },
          { upsert: true }
        )
      )
    );
  }

}

export default new ProductCategoryService();
