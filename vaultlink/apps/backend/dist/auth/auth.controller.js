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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const local_auth_guard_1 = require("./local-auth.guard");
const register_dto_1 = require("./dto/register.dto");
const login_dto_1 = require("./dto/login.dto");
const connect_wallet_dto_1 = require("./dto/connect-wallet.dto");
const user_service_1 = require("../user/user.service");
let AuthController = class AuthController {
    authService;
    userService;
    constructor(authService, userService) {
        this.authService = authService;
        this.userService = userService;
    }
    async login(req, loginDto) {
        return this.authService.login(req.user);
    }
    async register(registerDto) {
        const { email, password, stellarAccountId } = registerDto;
        return this.authService.register(email, password, stellarAccountId);
    }
    async stellarLogin(connectWalletDto) {
        const { publicKey, signature, message } = connectWalletDto;
        const isValid = await this.authService.verifyStellarSignature(publicKey, signature, message);
        if (!isValid) {
            throw new common_1.UnauthorizedException('Invalid Stellar signature');
        }
        const user = await this.userService.findByStellarAccountId(publicKey) || undefined;
        if (!user) {
            throw new common_1.UnauthorizedException('No user found with this Stellar account. Please register or link your wallet first.');
        }
        return this.authService.login(user);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.UseGuards)(local_auth_guard_1.LocalAuthGuard),
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, login_dto_1.LoginDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('stellar-login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [connect_wallet_dto_1.ConnectWalletDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "stellarLogin", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        user_service_1.UserService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map