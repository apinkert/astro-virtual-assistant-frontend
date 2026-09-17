import { createClientStateManager } from '@redhat-cloud-services/ai-client-state';
import { IFDClient } from '@redhat-cloud-services/arh-client';
import useChrome from '@redhat-cloud-services/frontend-components/useChrome';
import { useEffect, useMemo, useState } from 'react';

import { Models, StateManagerConfiguration, UseManagerHook } from './types';
import checkARHAuth from '../Components/ARHClient/checkARHAuth';
import ARHMessageEntry from '../Components/ARHClient/ARHMessageEntry';
import ARHFooter from '../Components/ARHClient/ARHFooter';
import { DEFAULT_WELCOME_CONTENT } from '../Components/UniversalChatbot/types';
import { useFlag } from '@unleash/proxy-client-react';
import { ARH_DEFAULT_FLAG } from './flags';

function useArhBaseUrl() {
  const chrome = useChrome();
  const ARHBaseUrl = useMemo(() => {
    // currently we are only allowed to talk to stage
    // we need KC deployed to accept new scope
    // FF is disabled for now in production/dev envs
    if (['prod', 'dev'].includes(chrome.getEnvironment())) {
      return 'https://access.redhat.com';
    }
    return 'https://access.stage.redhat.com';
  }, []);
  return ARHBaseUrl;
}

export function useArhAuthenticated() {
  const flagEnabled = useFlag('platform.arh.enabled');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const chrome = useChrome();
  const ARHBaseUrl = useArhBaseUrl();

  async function handleArhSetup() {
    try {
      const user = await chrome.auth.getUser();
      if (user) {
        const isEntitled = await checkARHAuth(ARHBaseUrl, user, chrome.auth.token);
        setIsAuthenticated(isEntitled);
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      setIsAuthenticated(false);
      console.error('Failed to check ARH chatbot auth', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    handleArhSetup();
  }, [chrome.auth.token]);

  if (!flagEnabled) {
    return {
      loading: false,
      isAuthenticated: false,
    };
  }

  return {
    loading,
    isAuthenticated,
  };
}

function useArhClient(): UseManagerHook {
  const { loading, isAuthenticated } = useArhAuthenticated();
  const baseUrl = useArhBaseUrl();
  const chrome = useChrome();
  const arhDefaultFlag = useFlag(ARH_DEFAULT_FLAG);
  const manager = useMemo(() => {
    const client = new IFDClient({
      // Will change to ARH
      baseUrl,
      fetchFunction: async (input, options) => {
        const token = await chrome.auth.getToken();
        if (!token) {
          throw new Error('User is not authenticated');
        }
        return fetch(input, {
          ...options,
          headers: {
            ...options?.headers,
            Authorization: `Bearer ${token}`,
            'App-Source-ID': 'CPIN-001',
          },
        });
      },
    });
    const stateManager = createClientStateManager(client);

    const configuration: StateManagerConfiguration<IFDClient> = {
      model: Models.ASK_RED_HAT,
      historyManagement: true,
      streamMessages: true,
      modelName: 'Ask Red Hat',
      selectionTitle: 'Ask Red Hat',
      selectionDescription:
        'Find answers about Red Hat products, error messages, security vulnerabilities, general usage, and other content from product documentation and our knowledge base.',
      MessageEntryComponent: ARHMessageEntry,
      FooterComponent: ARHFooter,
      stateManager,
      docsUrl: 'https://docs.redhat.com/en/documentation/red_hat_hybrid_cloud_console/1-latest/get_started-ai_powered_support#ask-red-hat',
      isPreview: !arhDefaultFlag,
      welcome: {
        content: DEFAULT_WELCOME_CONTENT,
        buttons: [
          {
            title: 'Tell me about Ask Red Hat.',
            value: 'Tell me about Ask Red Hat.',
          },
          {
            title: 'What technologies are used in Ask Red Hat?',
            value: 'What technologies are used in Ask Red Hat?',
          },
        ],
      },
    };
    return configuration;
  }, [baseUrl, arhDefaultFlag]);

  if (loading) {
    return { manager: null, loading };
  }

  if (!isAuthenticated) {
    return { manager: null, loading: false };
  }

  return { manager, loading: false };
}

export default useArhClient;
