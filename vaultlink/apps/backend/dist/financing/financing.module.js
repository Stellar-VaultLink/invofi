"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancingModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const financing_offer_entity_1 = require("./financing-offer.entity");
const financing_controller_1 = require("./financing.controller");
const financing_service_1 = require("./financing.service");
const invoice_module_1 = require("../invoice/invoice.module");
const transaction_module_1 = require("../transaction/transaction.module");
let FinancingModule = class FinancingModule {
};
exports.FinancingModule = FinancingModule;
exports.FinancingModule = FinancingModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([financing_offer_entity_1.FinancingOffer]), invoice_module_1.InvoiceModule, transaction_module_1.TransactionModule],
        controllers: [financing_controller_1.FinancingController],
        providers: [financing_service_1.FinancingService],
        exports: [financing_service_1.FinancingService],
    })
], FinancingModule);
//# sourceMappingURL=financing.module.js.map