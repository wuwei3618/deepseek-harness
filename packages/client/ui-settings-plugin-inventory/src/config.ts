/** Deployment choices shared by the inventory Host entry and its browser plugin. */
import z from '@deepseek-ai/schemastery'

/** Inventory card choices a deployment sets on the plugin's Loader entry. */
export interface Config {
  /**
   * Show each card's module specifier (for example `@deepseek-ai/dsh-tool-bash`)
   * in its details, title hover text, and search matches.
   */
  showModuleName: boolean
}

/** Validated inventory card choices; `showModuleName` defaults to `true`. */
export const Config: z<Partial<Config>, Config> = z.object({
  showModuleName: z.boolean().default(true),
})

/** Page global carrying the Host-validated {@link Config} to the browser plugin. */
export const CONFIG_GLOBAL = '__DSH_PLUGIN_INVENTORY_CONFIG__'
