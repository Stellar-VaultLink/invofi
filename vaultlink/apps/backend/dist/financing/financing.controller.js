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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancingController = void 0;
const common_1 = require("@nestjs/common");
const financing_service_1 = require("./financing.service");
const create_financing_dto_1 = require("./dto/create-financing.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let FinancingController = class FinancingController {
    financingService;
    constructor(financingService) {
        this.financingService = financingService;
    }
    create(createFinancingDto, req) {
        return this.financingService.create(createFinancingDto, req.user.id);
    }
    findAll(req) {
        return this.financingService.findAll(req.user.id);
    }
    findOne(id) {
        return this.financingService.findOne(id);
    }
    accept(id, req) {
        return this.financingService.accept(id, req.user.id);
    }
};
exports.FinancingController = FinancingController;
__decorate([
    (0, common_1.Post)('offers'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_financing_dto_1.CreateFinancingDto, Object]),
    __metadata("design:returntype", void 0)
], FinancingController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('offers'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FinancingController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('offers/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FinancingController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)('offers/:id/accept'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], FinancingController.prototype, "accept", null);
exports.FinancingController = FinancingController = __decorate([
    (0, common_1.Controller)('financing'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [financing_service_1.FinancingService])
], FinancingController);
//# sourceMappingURL=financing.controller.js.map