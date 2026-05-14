import { FinancingService } from './financing.service';
import { CreateFinancingDto } from './dto/create-financing.dto';
export declare class FinancingController {
    private financingService;
    constructor(financingService: FinancingService);
    create(createFinancingDto: CreateFinancingDto, req: any): Promise<import("./financing-offer.entity").FinancingOffer>;
    findAll(req: any): Promise<import("./financing-offer.entity").FinancingOffer[]>;
    findOne(id: string): Promise<import("./financing-offer.entity").FinancingOffer>;
    accept(id: string, req: any): Promise<import("./financing-offer.entity").FinancingOffer>;
}
