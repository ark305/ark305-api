import type { RequestStatus } from './request-lifecycle';

export type CreateServiceRequest = {
  serviceId: string;
  requestedDate: string;
  guests: number;
  preferences: string;
};

export type ServiceRequest = {
  id: string;
  serviceId: string;
  requestedDate: string;
  guests: number;
  preferences: string;
  status: RequestStatus;
  createdAt: string;
};

export abstract class RequestsPort {
  abstract create(token: string, ownerId: string, request: CreateServiceRequest): Promise<ServiceRequest>;
  abstract list(token: string, ownerId: string): Promise<ServiceRequest[]>;
  abstract findById(token: string, ownerId: string, id: string): Promise<ServiceRequest | undefined>;
}
