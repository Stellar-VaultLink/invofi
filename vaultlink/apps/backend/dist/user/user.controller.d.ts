import { UserService } from './user.service';
import { Request as ExpressRequest } from 'express';
export declare class UserController {
    private userService;
    constructor(userService: UserService);
    getProfile(req: ExpressRequest): Promise<import("./user.entity").User>;
    getUser(id: string): Promise<import("./user.entity").User>;
    updateProfile(req: ExpressRequest, updateData: Partial<any>): Promise<import("./user.entity").User>;
}
