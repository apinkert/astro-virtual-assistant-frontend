import { useMemo } from 'react';
import { LightspeedClient } from '@redhat-cloud-services/lightspeed-client';
import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import useChrome from '@redhat-cloud-services/frontend-components/useChrome';
import { useFlag } from '@unleash/proxy-client-react';
import { Models, StateManagerConfiguration, UseManagerHook } from './types';

export default function useHccAiManager(): UseManagerHook {
  const isEnabled = useFlag('platform.chatbot.hcc-ai-assistant.enabled');
  const chrome = useChrome();

  const manager = useMemo(() => {
    const client = new LightspeedClient({
      baseUrl: `${window.location.origin}/api/ai-assistant`,
      fetchFunction: async (input, options) => {
        const token = await chrome.auth.getToken();
        // TODO: Remove the `let body` reassignment, the `if` block below, and the `body` override in the fetch call
        // once llama-stack fixes model name normalization for allowed_models validation.
        // Tracking: https://redhat-internal.slack.com/archives/C07MC7G9T8A/p1778709207779339
        let body = options?.body;
        if (typeof input === 'string' && /\/v1\/(streaming_)?query$/.test(input) && typeof body === 'string') {
          try {
            const parsed = JSON.parse(body);
            parsed.model = 'publishers/google/models/gemini-2.5-flash';
            parsed.provider = 'google-vertex';
            // Workaround: topic summary generation times out due to unknown bug in lightspeed-stack,
            // even though it should be performed in the background.
            parsed.generate_topic_summary = false;
            body = JSON.stringify(parsed);
          } catch {
            // leave body unchanged if parsing fails
          }
        }
        return fetch(input, {
          ...options,
          body,
          headers: {
            ...options?.headers,
            Authorization: `Bearer ${token}`,
          },
        });
      },
    });
    const stateManager = createClientStateManager(client);

    const configuration: StateManagerConfiguration<LightspeedClient> = {
      model: Models.HCC_AI,
      historyManagement: true,
      streamMessages: false,
      modelName: 'HCC AI Assistant',
      selectionTitle: 'HCC AI Assistant',
      selectionDescription: 'Get help with the Hybrid Cloud Console, manage your organization, configure settings, and more.',
      stateManager,
      docsUrl: 'https://docs.redhat.com/en/documentation/red_hat_hybrid_cloud_console/1-latest/get_started-ai_powered_support#virtual-assistant',
      welcome: {
        buttons: [
          {
            title: 'What can you help me with?',
            value: 'What can you help me with?',
          },
          {
            title: 'List the principals in my organization',
            value: 'List the principals in my organization',
          },
        ],
      },
    };

    return configuration;
  }, [chrome]);

  if (!isEnabled) {
    return { manager: null, loading: false };
  }

  return { manager, loading: false };
}
