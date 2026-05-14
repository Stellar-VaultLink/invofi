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
exports.Transaction = exports.TransactionStatus = exports.TransactionType = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../user/user.entity");
const invoice_entity_1 = require("../invoice/invoice.entity");
const financing_offer_entity_1 = require("../financing/financing-offer.entity");
var TransactionType;
(function (TransactionType) {
    TransactionType["INVOICE_TOKENIZATION"] = "invoice_tokenization";
    TransactionType["OFFER_ACCEPTANCE"] = "offer_acceptance";
    TransactionType["REPAYMENT"] = "repayment";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["PENDING"] = "pending";
    TransactionStatus["COMPLETED"] = "completed";
    TransactionStatus["FAILED"] = "failed";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
let Transaction = class Transaction {
    id;
    type;
    status;
    txHash;
    contractId;
    tokenId;
    createdAt;
    userId;
    user;
    invoiceId;
    invoice;
    offerId;
    offer;
};
exports.Transaction = Transaction;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Transaction.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: TransactionType }),
    __metadata("design:type", String)
], Transaction.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING }),
    __metadata("design:type", String)
], Transaction.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Transaction.prototype, "txHash", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Transaction.prototype, "contractId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Transaction.prototype, "tokenId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Transaction.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Transaction.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.invoices),
    __metadata("design:type", user_entity_1.User)
], Transaction.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Transaction.prototype, "invoiceId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => invoice_entity_1.Invoice),
    __metadata("design:type", invoice_entity_1.Invoice)
], Transaction.prototype, "invoice", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Transaction.prototype, "offerId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => financing_offer_entity_1.FinancingOffer),
    __metadata("design:type", financing_offer_entity_1.FinancingOffer)
], Transaction.prototype, "offer", void 0);
exports.Transaction = Transaction = __decorate([
    (0, typeorm_1.Entity)('transactions')
], Transaction);
//# sourceMappingURL=transaction.entity.js.map