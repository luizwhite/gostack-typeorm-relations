import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import IUpdateProductsQuantityDTO from '@modules/products/dtos/IUpdateProductsQuantityDTO';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const productsWithInsufficientQuantity: string[] = [];
    const productsToUpdateQuantity: IUpdateProductsQuantityDTO[] = [];
    const customerFound = await this.customersRepository.findById(customer_id);

    if (!customerFound) throw new AppError('Customer does not exist!');

    const productsFound = await this.productsRepository.findAllById(
      products.map((product) => ({
        id: product.id,
      })),
    );

    if (productsFound.length === 0) {
      throw new AppError('None of these products have been found!', 400);
    }

    if (products.length !== productsFound.length) {
      throw new AppError(
        'One or more products of the list have not been found..',
        400,
      );
    }

    // prettier-ignore
    productsFound.forEach((product) => {
      const orderProductFound = products.find(
        (orderProduct) => orderProduct.id === product.id,
      );
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const orderProductQuantity = orderProductFound!.quantity;
      const productBalance = product.quantity;

      if (productBalance < orderProductQuantity) {
        productsWithInsufficientQuantity.push(product.name);
      }

      if (productsWithInsufficientQuantity.length === 0) {
        const updatedQuantity = productBalance - orderProductQuantity;

        productsToUpdateQuantity.push({
          id: product.id,
          quantity: updatedQuantity,
        });
      }
    });

    if (productsWithInsufficientQuantity.length > 0) {
      throw new AppError(
        `Not sufficient balance for products ${productsWithInsufficientQuantity.toString()}`,
        400,
      );
    }

    await this.productsRepository.updateQuantity(productsToUpdateQuantity);

    const orderProducts = products.map((orderProduct) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { price } = productsFound.find(
        (productInventory) => productInventory.id === orderProduct.id,
      )!;
      const { quantity } = orderProduct;

      return {
        product_id: orderProduct.id,
        price,
        quantity,
      };
    });

    return this.ordersRepository.create({
      customer: customerFound,
      products: orderProducts,
    });
  }
}

export default CreateOrderService;
