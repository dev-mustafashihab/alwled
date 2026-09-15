/**
 * POST /orders takes NO business payload: items, quantities and prices all come
 * from the server-side cart and the database.
 *
 * The class is intentionally empty — with the global ValidationPipe
 * (whitelist + forbidNonWhitelisted) any sent field (`items`, `total`, `price`,
 * `userId`, ...) is rejected with 400. Declaring an unused property here would
 * make class-transformer materialise it and break empty bodies.
 */
export class CreateOrderDto {}
