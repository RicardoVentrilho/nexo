export interface KeycloakTargetInput {
  internalOrigin: string;
  localOrigin?: string | undefined;
  path: string[];
  requestUrl: string;
}

export function buildKeycloakTargetUrls({ internalOrigin, localOrigin, path, requestUrl }: KeycloakTargetInput): URL[] {
  const request = new URL(requestUrl);
  const origins = localOrigin && localOrigin !== internalOrigin ? [internalOrigin, localOrigin] : [internalOrigin];
  return origins.map((origin) => {
    const target = new URL(`${origin}/${path.join("/")}`);
    target.search = request.search;
    return target;
  });
}
