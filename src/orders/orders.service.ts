import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto';
import { PRODUCT_SERVICE } from 'src/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService  extends PrismaClient implements OnModuleInit{

  private readonly logger = new Logger('OrdersService');

  constructor(
    @Inject(PRODUCT_SERVICE) private readonly productsClient: ClientProxy
  ) {
    super();
  }

  //Establece conexión con la base de datos
  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to the database');
  }

  async create(createOrderDto: CreateOrderDto) {
    try {
      //1.- Validamos contra el ms de productos que los productos existan
      const productIds = createOrderDto.items.map(item => item.productId);
      const products: any[] = await firstValueFrom(
        this.productsClient.send({cmd: 'validate_products'}, productIds)
     );

     //2.- Calculamos los precios de los productos
     const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {

      const price = products.find(
        (product) => product.id === orderItem.productId,
      ).price;

      return acc + price * orderItem.quantity;

     },0);

     const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
     },0);

     //3.- Creamos la orden en base de datos
      const order = await this.order.create({
        data: {
          totalAmount: totalAmount,
          totalItems: totalItems,
          OrderItems: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                quantity: orderItem.quantity,
                price: products.find( products => products.id === orderItem.productId).price,
                productId: orderItem.productId
              })) 
            },
          }
        },
        include:{
          OrderItems: {
            select: {
              price: true,
              quantity: true,
              productId: true
            }
          }
        }
      });
    
      // Solo bastaria con retornar el order pero hacemos esta logica para incluir 
      // el nombre de los productos
     return {
        ...order,
        OrderItems: order.OrderItems.map((orderItem) => ({
          ...orderItem,
          productName: products.find(product => product.id === orderItem.productId).name
        }))
     };
      
    } catch (error) {
      throw new RpcException(
        {
          status: HttpStatus.BAD_REQUEST,
          message: 'Error validating products'
        }
      );
    }


  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const totalPages = await this.order.count({
      where: {
        status: orderPaginationDto.status
      }
    });

    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit;

    return {
      data: await this.order.findMany({
        skip: (currentPage - 1) * perPage,
        take: perPage,
        where: {
          status: orderPaginationDto.status
        }
      }),
      meta: {
        total: totalPages,
        page: currentPage,
        last_page: Math.ceil(totalPages / perPage)
      }
    }
  }

  async findOne(id: string) {

    const order = await this.order.findFirst(
      {
        where: { id: id },
        include: {
          OrderItems: {
            select: {
              price: true,
              quantity: true,
              productId: true
            }
          }
        }
      }
    );

    if (!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: 'Order not found'
      });
    }

    const productIds = order.OrderItems.map((orderItem) => orderItem.productId);
    const products: any[] = await firstValueFrom(
      this.productsClient.send({cmd: 'validate_products'}, productIds)
    );

    return {
      ...order,
      OrderItems: order.OrderItems.map((orderItem) => ({
        ...orderItem,
        name: products.find(product => product.id === orderItem.productId).name
      }))
    };
  }

  async changeOrderStatus(changeOrderStatusDto: ChangeOrderStatusDto){

    const {id, status} = changeOrderStatusDto;

    const order = await this.findOne(id);

    if (order.status === status) {
      return order

    }
    
    return this.order.update({
      where: { id: id },
      data: { status: status }
    });

  }

}
