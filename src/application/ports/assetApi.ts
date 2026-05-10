import type { AssetDefinition } from '../../domain/graphcore'

export type SignedProjectAssetUrl = {
  assetKey: string
  signedUrl: string
}

export type SignProjectAssetUrlsInput = {
  projectId?: string
  assetKeys: string[]
}

export type AssetApi = {
  signProjectAssetUrls(projectId: string, assetKeys: string[]): Promise<AssetDefinition[]>
  signProjectAssetUrlEntries(input: SignProjectAssetUrlsInput): Promise<SignedProjectAssetUrl[]>
}
