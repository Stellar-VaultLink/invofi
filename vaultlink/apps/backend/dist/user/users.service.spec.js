"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_service_1 = require("./user.service");
const user_entity_1 = require("./user.entity");
const bcrypt = require("bcrypt");
describe('UsersService', () => {
    let service;
    let repository;
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                user_service_1.UserService,
                {
                    provide: (0, typeorm_1.getRepositoryToken)(user_entity_1.User),
                    useClass: typeorm_2.Repository,
                },
            ],
        }).compile();
        service = module.get(user_service_1.UserService);
        repository = module.get((0, typeorm_1.getRepositoryToken)(user_entity_1.User));
    });
    it('should be defined', () => {
        expect(service).toBeDefined();
    });
    it('should create a user and hash the password', async () => {
        const email = 'test@example.com';
        const password = 'password123';
        const hashedPassword = await bcrypt.hash(password, 10);
        jest.spyOn(repository, 'create').mockReturnValue({ id: '1', email, passwordHash: hashedPassword, role: 'originator', stellarAccountId: undefined, invoices: [], lendingOffers: [], transactions: [] });
        jest.spyOn(repository, 'save').mockResolvedValue({ id: '1', email, passwordHash: hashedPassword, role: 'originator', stellarAccountId: undefined, invoices: [], lendingOffers: [], transactions: [] });
        const user = await service.create(email, password);
        expect(user.email).toEqual(email);
        expect(bcrypt.compareSync(password, user.passwordHash)).toBe(true);
    });
});
//# sourceMappingURL=users.service.spec.js.map