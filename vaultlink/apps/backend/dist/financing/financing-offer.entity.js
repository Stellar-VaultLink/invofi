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
exports.FinancingOffer = exports.OfferStatus = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../user/user.entity");
const invoice_entity_1 = require("../invoice/invoice.entity");
var OfferStatus;
(function (OfferStatus) {
    OfferStatus["PENDING"] = "pending";
    OfferStatus["ACCEPTED"] = "accepted";
    OfferStatus["REJECTED"] = "rejected";
    OfferStatus["EXPIRED"] = "expired";
})(OfferStatus || (exports.OfferStatus = OfferStatus = {}));
let FinancingOffer = class FinancingOffer {
    id;
    amount;
    interestRate;
    duration;
    status;
    contractId;
    createdAt;
    updatedAt;
    invoiceId;
    lenderId;
    invoice;
    lender;
};
exports.FinancingOffer = FinancingOffer;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], FinancingOffer.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 20, scale: 7 }),
    __metadata("design:type", String)
], FinancingOffer.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 5, scale: 2 }),
    __metadata("design:type", Number)
], FinancingOffer.prototype, "interestRate", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], FinancingOffer.prototype, "duration", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: OfferStatus, default: OfferStatus.PENDING }),
    __metadata("design:type", String)
], FinancingOffer.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], FinancingOffer.prototype, "contractId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], FinancingOffer.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], FinancingOffer.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], FinancingOffer.prototype, "invoiceId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], FinancingOffer.prototype, "lenderId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => invoice_entity_1.Invoice, (invoice) => invoice.financingOffers),
    __metadata("design:type", invoice_entity_1.Invoice)
], FinancingOffer.prototype, "invoice", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.lendingOffers),
    __metadata("design:type", user_entity_1.User)
], FinancingOffer.prototype, "lender", void 0);
exports.FinancingOffer = FinancingOffer = __decorate([
    (0, typeorm_1.Entity)('financing_offers')
], FinancingOffer);
//# sourceMappingURL=financing-offer.entity.js.map