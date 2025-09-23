// RequestConfig Interface
export interface RequestConfig {
  baseUrl: string
  headers?: Record<string, string> // Additional headers
  params?: Record<string, string | undefined> // Additional query params
  body?: Record<string, any> // Additional body key-value pairs
  transformRequest?: RequestTransformer // Transform request callback
  xsrfHeaderName?: string // The HTTP header that carries the xsrf token value
  fetchParams?: Record<string, any> // Additional options for the fetch request
  fetchRequestInterceptor?: (request: Request) => Request // Request Interceptor for fetch request
  fetchResponseInterceptor?: (response: Response) => Response // Response Interceptor for fetch request
}

// RequestTransformParams Interface
interface RequestTransformParams {
  url: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' // HTTP methods
  headers: Record<string, string>
  params: Record<string, string | undefined>
  body: Record<string, string | undefined> | FormData | null // Body can be a form data or key-value pairs
}

// RequestTransformResult Interface
interface RequestTransformResult {
  url?: string
  method?: 'get' | 'post' | 'put' | 'patch' | 'delete' // HTTP methods
  headers?: Record<string, string>
  params?: Record<string, string | undefined>
  body?: Record<string, string | undefined> | FormData // Body can be a form data or key-value pairs
}

// RequestTransformResultInternal Interface
interface RequestTransformResultInternal {
  url: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' // HTTP methods
  headers: Record<string, string>
  params: Record<string, string | undefined>
  body?: Record<string, string | undefined> | FormData // Body can be a form data or key-value pairs
}

// RequestTransformer Callback Type
type RequestTransformer = (request: RequestTransformParams) => RequestTransformResult
