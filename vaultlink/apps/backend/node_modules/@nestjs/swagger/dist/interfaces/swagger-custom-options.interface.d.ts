import { SwaggerUiOptions } from './swagger-ui-options.interface';
import { OpenAPIObject } from './open-api-spec.interface';
export interface SwaggerCustomOptions {
    useGlobalPrefix?: boolean;
    swaggerUiEnabled?: boolean;
    swaggerUrl?: string;
    jsonDocumentUrl?: string;
    yamlDocumentUrl?: string;
    patchDocumentOnRequest?: <TRequest = any, TResponse = any>(req: TRequest, res: TResponse, document: OpenAPIObject) => OpenAPIObject;
    explorer?: boolean;
    swaggerOptions?: SwaggerUiOptions;
    customCss?: string;
    customCssUrl?: string | string[];
    customJs?: string | string[];
    customJsStr?: string | string[];
    customfavIcon?: string;
    customSiteTitle?: string;
    customSwaggerUiPath?: string;
    validatorUrl?: string;
    url?: string;
    urls?: Record<'url' | 'name', string>[];
}
