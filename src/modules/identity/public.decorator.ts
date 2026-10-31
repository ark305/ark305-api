import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'ark305:public-route';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
