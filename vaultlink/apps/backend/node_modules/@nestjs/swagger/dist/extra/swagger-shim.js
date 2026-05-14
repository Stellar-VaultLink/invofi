"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiLengthRequiredResponse = exports.ApiGoneResponse = exports.ApiConflictResponse = exports.ApiRequestTimeoutResponse = exports.ApiProxyAuthenticationRequiredResponse = exports.ApiNotAcceptableResponse = exports.ApiMethodNotAllowedResponse = exports.ApiNotFoundResponse = exports.ApiForbiddenResponse = exports.ApiPaymentRequiredResponse = exports.ApiUnauthorizedResponse = exports.ApiBadRequestResponse = exports.ApiPermanentRedirectResponse = exports.ApiTemporaryRedirectResponse = exports.ApiNotModifiedResponse = exports.ApiSeeOtherResponse = exports.ApiFoundResponse = exports.ApiMovedPermanentlyResponse = exports.ApiAmbiguousResponse = exports.ApiPartialContentResponse = exports.ApiResetContentResponse = exports.ApiNoContentResponse = exports.ApiNonAuthoritativeInformationResponse = exports.ApiAcceptedResponse = exports.ApiCreatedResponse = exports.ApiOkResponse = exports.ApiEarlyhintsResponse = exports.ApiProcessingResponse = exports.ApiSwitchingProtocolsResponse = exports.ApiContinueResponse = exports.ApiResponse = exports.ApiQuery = exports.ApiProduces = exports.ApiParam = exports.ApiOperation = exports.ApiOAuth2 = exports.ApiHideProperty = exports.ApiHeaders = exports.ApiHeader = exports.ApiExtraModels = exports.ApiExcludeController = exports.ApiExcludeEndpoint = exports.ApiCookieAuth = exports.ApiConsumes = exports.ApiBody = exports.ApiBearerAuth = exports.ApiBasicAuth = exports.ApiResponseProperty = exports.ApiPropertyOptional = exports.ApiProperty = void 0;
exports.ReadonlyVisitor = exports.before = exports.refs = exports.getSchemaPath = exports.PickType = exports.PartialType = exports.OmitType = exports.IntersectionType = exports.SwaggerModule = exports.DocumentBuilder = exports.ApiExtension = exports.ApiTags = exports.ApiSecurity = exports.ApiDefaultResponse = exports.ApiHttpVersionNotSupportedResponse = exports.ApiGatewayTimeoutResponse = exports.ApiServiceUnavailableResponse = exports.ApiBadGatewayResponse = exports.ApiNotImplementedResponse = exports.ApiInternalServerErrorResponse = exports.ApiTooManyRequestsResponse = exports.ApiPreconditionRequiredResponse = exports.ApiFailedDependencyResponse = exports.ApiUnprocessableEntityResponse = exports.ApiMisdirectedResponse = exports.ApiIAmATeapotResponse = exports.ApiExpectationFailedResponse = exports.ApiRequestedRangeNotSatisfiableResponse = exports.ApiUnsupportedMediaTypeResponse = exports.ApiUriTooLongResponse = exports.ApiPayloadTooLargeResponse = exports.ApiPreconditionFailedResponse = void 0;
function ApiProperty() {
    return () => { };
}
exports.ApiProperty = ApiProperty;
function ApiPropertyOptional() {
    return () => { };
}
exports.ApiPropertyOptional = ApiPropertyOptional;
function ApiResponseProperty() {
    return () => { };
}
exports.ApiResponseProperty = ApiResponseProperty;
function ApiBasicAuth() {
    return () => { };
}
exports.ApiBasicAuth = ApiBasicAuth;
function ApiBearerAuth() {
    return () => { };
}
exports.ApiBearerAuth = ApiBearerAuth;
function ApiBody() {
    return () => { };
}
exports.ApiBody = ApiBody;
function ApiConsumes() {
    return () => { };
}
exports.ApiConsumes = ApiConsumes;
function ApiCookieAuth() {
    return () => { };
}
exports.ApiCookieAuth = ApiCookieAuth;
function ApiExcludeEndpoint() {
    return () => { };
}
exports.ApiExcludeEndpoint = ApiExcludeEndpoint;
function ApiExcludeController() {
    return () => { };
}
exports.ApiExcludeController = ApiExcludeController;
function ApiExtraModels() {
    return () => { };
}
exports.ApiExtraModels = ApiExtraModels;
function ApiHeader() {
    return () => { };
}
exports.ApiHeader = ApiHeader;
function ApiHeaders() {
    return () => { };
}
exports.ApiHeaders = ApiHeaders;
function ApiHideProperty() {
    return () => { };
}
exports.ApiHideProperty = ApiHideProperty;
function ApiOAuth2() {
    return () => { };
}
exports.ApiOAuth2 = ApiOAuth2;
function ApiOperation() {
    return () => { };
}
exports.ApiOperation = ApiOperation;
function ApiParam() {
    return () => { };
}
exports.ApiParam = ApiParam;
function ApiProduces() {
    return () => { };
}
exports.ApiProduces = ApiProduces;
function ApiQuery() {
    return () => { };
}
exports.ApiQuery = ApiQuery;
function ApiResponse() {
    return () => { };
}
exports.ApiResponse = ApiResponse;
function ApiContinueResponse() {
    return () => { };
}
exports.ApiContinueResponse = ApiContinueResponse;
function ApiSwitchingProtocolsResponse() {
    return () => { };
}
exports.ApiSwitchingProtocolsResponse = ApiSwitchingProtocolsResponse;
function ApiProcessingResponse() {
    return () => { };
}
exports.ApiProcessingResponse = ApiProcessingResponse;
function ApiEarlyhintsResponse() {
    return () => { };
}
exports.ApiEarlyhintsResponse = ApiEarlyhintsResponse;
function ApiOkResponse() {
    return () => { };
}
exports.ApiOkResponse = ApiOkResponse;
function ApiCreatedResponse() {
    return () => { };
}
exports.ApiCreatedResponse = ApiCreatedResponse;
function ApiAcceptedResponse() {
    return () => { };
}
exports.ApiAcceptedResponse = ApiAcceptedResponse;
function ApiNonAuthoritativeInformationResponse() {
    return () => { };
}
exports.ApiNonAuthoritativeInformationResponse = ApiNonAuthoritativeInformationResponse;
function ApiNoContentResponse() {
    return () => { };
}
exports.ApiNoContentResponse = ApiNoContentResponse;
function ApiResetContentResponse() {
    return () => { };
}
exports.ApiResetContentResponse = ApiResetContentResponse;
function ApiPartialContentResponse() {
    return () => { };
}
exports.ApiPartialContentResponse = ApiPartialContentResponse;
function ApiAmbiguousResponse() {
    return () => { };
}
exports.ApiAmbiguousResponse = ApiAmbiguousResponse;
function ApiMovedPermanentlyResponse() {
    return () => { };
}
exports.ApiMovedPermanentlyResponse = ApiMovedPermanentlyResponse;
function ApiFoundResponse() {
    return () => { };
}
exports.ApiFoundResponse = ApiFoundResponse;
function ApiSeeOtherResponse() {
    return () => { };
}
exports.ApiSeeOtherResponse = ApiSeeOtherResponse;
function ApiNotModifiedResponse() {
    return () => { };
}
exports.ApiNotModifiedResponse = ApiNotModifiedResponse;
function ApiTemporaryRedirectResponse() {
    return () => { };
}
exports.ApiTemporaryRedirectResponse = ApiTemporaryRedirectResponse;
function ApiPermanentRedirectResponse() {
    return () => { };
}
exports.ApiPermanentRedirectResponse = ApiPermanentRedirectResponse;
function ApiBadRequestResponse() {
    return () => { };
}
exports.ApiBadRequestResponse = ApiBadRequestResponse;
function ApiUnauthorizedResponse() {
    return () => { };
}
exports.ApiUnauthorizedResponse = ApiUnauthorizedResponse;
function ApiPaymentRequiredResponse() {
    return () => { };
}
exports.ApiPaymentRequiredResponse = ApiPaymentRequiredResponse;
function ApiForbiddenResponse() {
    return () => { };
}
exports.ApiForbiddenResponse = ApiForbiddenResponse;
function ApiNotFoundResponse() {
    return () => { };
}
exports.ApiNotFoundResponse = ApiNotFoundResponse;
function ApiMethodNotAllowedResponse() {
    return () => { };
}
exports.ApiMethodNotAllowedResponse = ApiMethodNotAllowedResponse;
function ApiNotAcceptableResponse() {
    return () => { };
}
exports.ApiNotAcceptableResponse = ApiNotAcceptableResponse;
function ApiProxyAuthenticationRequiredResponse() {
    return () => { };
}
exports.ApiProxyAuthenticationRequiredResponse = ApiProxyAuthenticationRequiredResponse;
function ApiRequestTimeoutResponse() {
    return () => { };
}
exports.ApiRequestTimeoutResponse = ApiRequestTimeoutResponse;
function ApiConflictResponse() {
    return () => { };
}
exports.ApiConflictResponse = ApiConflictResponse;
function ApiGoneResponse() {
    return () => { };
}
exports.ApiGoneResponse = ApiGoneResponse;
function ApiLengthRequiredResponse() {
    return () => { };
}
exports.ApiLengthRequiredResponse = ApiLengthRequiredResponse;
function ApiPreconditionFailedResponse() {
    return () => { };
}
exports.ApiPreconditionFailedResponse = ApiPreconditionFailedResponse;
function ApiPayloadTooLargeResponse() {
    return () => { };
}
exports.ApiPayloadTooLargeResponse = ApiPayloadTooLargeResponse;
function ApiUriTooLongResponse() {
    return () => { };
}
exports.ApiUriTooLongResponse = ApiUriTooLongResponse;
function ApiUnsupportedMediaTypeResponse() {
    return () => { };
}
exports.ApiUnsupportedMediaTypeResponse = ApiUnsupportedMediaTypeResponse;
function ApiRequestedRangeNotSatisfiableResponse() {
    return () => { };
}
exports.ApiRequestedRangeNotSatisfiableResponse = ApiRequestedRangeNotSatisfiableResponse;
function ApiExpectationFailedResponse() {
    return () => { };
}
exports.ApiExpectationFailedResponse = ApiExpectationFailedResponse;
function ApiIAmATeapotResponse() {
    return () => { };
}
exports.ApiIAmATeapotResponse = ApiIAmATeapotResponse;
function ApiMisdirectedResponse() {
    return () => { };
}
exports.ApiMisdirectedResponse = ApiMisdirectedResponse;
function ApiUnprocessableEntityResponse() {
    return () => { };
}
exports.ApiUnprocessableEntityResponse = ApiUnprocessableEntityResponse;
function ApiFailedDependencyResponse() {
    return () => { };
}
exports.ApiFailedDependencyResponse = ApiFailedDependencyResponse;
function ApiPreconditionRequiredResponse() {
    return () => { };
}
exports.ApiPreconditionRequiredResponse = ApiPreconditionRequiredResponse;
function ApiTooManyRequestsResponse() {
    return () => { };
}
exports.ApiTooManyRequestsResponse = ApiTooManyRequestsResponse;
function ApiInternalServerErrorResponse() {
    return () => { };
}
exports.ApiInternalServerErrorResponse = ApiInternalServerErrorResponse;
function ApiNotImplementedResponse() {
    return () => { };
}
exports.ApiNotImplementedResponse = ApiNotImplementedResponse;
function ApiBadGatewayResponse() {
    return () => { };
}
exports.ApiBadGatewayResponse = ApiBadGatewayResponse;
function ApiServiceUnavailableResponse() {
    return () => { };
}
exports.ApiServiceUnavailableResponse = ApiServiceUnavailableResponse;
function ApiGatewayTimeoutResponse() {
    return () => { };
}
exports.ApiGatewayTimeoutResponse = ApiGatewayTimeoutResponse;
function ApiHttpVersionNotSupportedResponse() {
    return () => { };
}
exports.ApiHttpVersionNotSupportedResponse = ApiHttpVersionNotSupportedResponse;
function ApiDefaultResponse() {
    return () => { };
}
exports.ApiDefaultResponse = ApiDefaultResponse;
function ApiSecurity() {
    return () => { };
}
exports.ApiSecurity = ApiSecurity;
function ApiTags() {
    return () => { };
}
exports.ApiTags = ApiTags;
function ApiExtension() {
    return () => { };
}
exports.ApiExtension = ApiExtension;
function DocumentBuilder() {
    return () => { };
}
exports.DocumentBuilder = DocumentBuilder;
function SwaggerModule() {
    return () => { };
}
exports.SwaggerModule = SwaggerModule;
function IntersectionType() {
    return class {
    };
}
exports.IntersectionType = IntersectionType;
function OmitType() {
    return class {
    };
}
exports.OmitType = OmitType;
function PartialType() {
    return class {
    };
}
exports.PartialType = PartialType;
function PickType() {
    return class {
    };
}
exports.PickType = PickType;
function getSchemaPath() {
    return () => '';
}
exports.getSchemaPath = getSchemaPath;
function refs() {
    return [];
}
exports.refs = refs;
function before() {
    return () => '';
}
exports.before = before;
function ReadonlyVisitor() {
    return class {
    };
}
exports.ReadonlyVisitor = ReadonlyVisitor;
