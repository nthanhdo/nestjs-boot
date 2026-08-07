# 11 - Microservices (gRPC)

A microservice architecture splits your app into small, independent services that communicate over the network.

## Monolith vs Microservices

This learning project is a **monolith** -- everything in one process. The `examples/microservices/` folder shows the same functionality split into 10 independent services.

| Aspect | Monolith | Microservices |
|--------|----------|---------------|
| Deployment | One app | Many apps |
| Scaling | Scale everything | Scale each service independently |
| Complexity | Simple | Complex (networking, discovery, tracing) |
| Best for | Small teams, early stage | Large teams, high scale |

**Start monolith, split later** is the recommended approach.

## gRPC

gRPC is a high-performance RPC framework. Instead of REST (JSON over HTTP), gRPC uses Protocol Buffers (binary) over HTTP/2.

```
REST:  Client -> HTTP/JSON  -> Server
gRPC:  Client -> HTTP2/Protobuf -> Server (faster, typed, streaming)
```

## nestjs-boot Transport Config

```typescript
const app = await createApp(AppModule, {
  transport: {
    grpc: {
      url: '0.0.0.0:5000',
      package: 'product',
      protoPath: join(__dirname, 'product.proto'),
    },
  },
});
```

This makes your service listen on both HTTP (REST) and gRPC simultaneously.

## Protocol Buffer Definition

```protobuf
syntax = "proto3";
package product;

service ProductService {
  rpc FindOne (ProductById) returns (Product);
  rpc FindAll (ProductFilter) returns (ProductList);
  rpc Create (CreateProductRequest) returns (Product);
}

message Product {
  string id = 1;
  string name = 2;
  double price = 3;
  int32 stock = 4;
}
```

## Calling Between Services

```typescript
import { InjectGrpcClient } from 'nestjs-boot';
import { ClientGrpc } from '@nestjs/microservices';

constructor(@InjectGrpcClient('PRODUCT') private client: ClientGrpc) {}

onModuleInit() {
  this.productService = this.client.getService('ProductService');
}

async getProduct(id: string) {
  return this.productService.FindOne({ id }).toPromise();
}
```

## When to Use Microservices

Use microservices when you have:
- Teams that need to deploy independently
- Services with vastly different scaling needs
- Services in different programming languages

Do NOT use microservices just because "everyone does it." The networking overhead, operational complexity, and debugging difficulty are real costs.

## Exercise

Try [Exercise 07: Connect Services](../exercises/07-connect-services.md)

---

Next: [12 - Deployment](12-deployment.md)
