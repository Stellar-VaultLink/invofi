"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Invoice = exports.InvoiceStatus = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../user/user.entity");
const financing_offer_entity_1 = require("../financing/financing-offer.entity");
var InvoiceStatus;
(function (InvoiceStatus) {
    InvoiceStatus["DRAFT"] = "draft";
    InvoiceStatus["PENDING"] = "pending";
    InvoiceStatus["FUNDED"] = "funded";
    InvoiceStatus["REPAID"] = "repaid";
    InvoiceStatus["DEFAULTED"] = "defaulted";
})(InvoiceStatus || (exports.InvoiceStatus = InvoiceStatus = {}));
let Invoice = class Invoice {
    id;
    title;
    description;
    amount;
    currency;
    issuer;
    recipient;
    dueDate;
    status;
    contractId;
    tokenId;
    createdAt;
    updatedAt;
    createdById;
    createdBy;
    financingOffers;
};
exports.Invoice = Invoice;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Invoice.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Invoice.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Invoice.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 20, scale: 7 }),
    __metadata("design:type", String)
], Invoice.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Invoice.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Invoice.prototype, "issuer", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Invoice.prototype, "recipient", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Date)
], Invoice.prototype, "dueDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT }),
    __metadata("design:type", String)
], Invoice.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Invoice.prototype, "contractId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Invoice.prototype, "tokenId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Invoice.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Invoice.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Invoice.prototype, "createdById", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.invoices),
    __metadata("design:type", user_entity_1.User)
], Invoice.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => financing_offer_entity_1.FinancingOffer, (offer) => offer.invoice),
    __metadata("design:type", Array)
], Invoice.prototype, "financingOffers", void 0);
exports.Invoice = Invoice = __decorate([
    (0, typeorm_1.Entity)('invoices')
], Invoice);
//# sourceMappingURL=invoice.entity.js.map