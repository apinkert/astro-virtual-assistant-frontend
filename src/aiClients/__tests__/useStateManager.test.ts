import { act, renderHook } from '@testing-library/react';
import useStateManager from '../useStateManager';
import { useLocation } from 'react-router-dom';
import { VirtualAssistantStateSingleton } from '../../utils/VirtualAssistantStateSingleton';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: jest.fn(),
}));

// Mock scalprum remote hook manager API used by the hook under test
const createStateManager = () => ({
  isInitialized: jest.fn(() => false),
  isInitializing: jest.fn(() => false),
  init: jest.fn(),
});

const mockAddHook = jest.fn();
const mockCleanup = jest.fn();
const mockHookResults: Array<Record<string, unknown>> = [];
jest.mock('@scalprum/react-core', () => ({
  useRemoteHookManager: jest.fn(() => ({
    addHook: mockAddHook,
    cleanup: mockCleanup,
    get hookResults() {
      return mockHookResults;
    },
  })),
}));

// Mock the useFlag hook for feature flags
const mockUseFlag = jest.fn();
jest.mock('@unleash/proxy-client-react', () => ({
  useFlag: (flag: string) => mockUseFlag(flag),
}));

describe('useStateManager', () => {
  beforeAll(() => {
    jest.resetModules();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockHookResults.length = 0;
    mockHookResults.push(
      {
        id: 'arh',
        loading: false,
        error: null,
        hookResult: {
          manager: {
            model: 'Ask Red Hat',
            stateManager: createStateManager(),
            historyManagement: true,
            streamMessages: true,
            routes: ['/baz/*'],
          },
        },
      },
      {
        id: 'rhel',
        loading: false,
        error: null,
        hookResult: {
          manager: {
            model: 'RHEL Lightspeed',
            stateManager: createStateManager(),
            historyManagement: false,
            streamMessages: false,
            routes: ['/foo/bar/*'],
          },
        },
      },
      {
        id: 'ai',
        loading: false,
        error: 'An error occured',
        hookResult: {
          manager: {
            model: 'AI Chatbot',
            stateManager: createStateManager(),
            historyManagement: false,
            streamMessages: false,
            routes: ['/ai/*'],
          },
        },
      }
    );
    (useLocation as jest.Mock).mockReturnValue({ pathname: '/' });
    VirtualAssistantStateSingleton.setIsOpen(false);
    VirtualAssistantStateSingleton.setCurrentModel(undefined);

    // Mock global fetch to prevent network calls and silence warnings
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    ) as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  const actWait = async (ms = 0) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
      await Promise.resolve();
    });
  };

  it('sets currentModel to the first available', async () => {
    mockUseFlag.mockReturnValue(false);
    const { result } = renderHook(() => useStateManager(true));
    await actWait();
    expect(result.current.currentModel).toBe('Ask Red Hat');
  }, 10000);

  it('handles failed module by not blocking initialization', async () => {
    // Enable chatbot so the hook proceeds to compute a model
    mockUseFlag.mockReturnValue(true);

    const { result } = renderHook(() => useStateManager(true));

    await actWait();

    // Even though one module failed, the hook should still select the ARH model
    expect(result.current.currentModel).toBe('Ask Red Hat');
  });

  it('sets currentModel to matching route', async () => {
    mockUseFlag.mockReturnValue(false);
    (useLocation as jest.Mock).mockReturnValue({ pathname: '/baz/foo' });
    const { result, rerender } = renderHook((isOpen: boolean) => useStateManager(isOpen));
    await actWait();
    expect(result.current.currentModel).toBe('Ask Red Hat');

    (useLocation as jest.Mock).mockReturnValue({ pathname: '/foo/bar/baz' });
    rerender(true);
    await actWait();
    expect(result.current.currentModel).toBe('RHEL Lightspeed');
  }, 10000);

  it('does not show non-authenticated models', async () => {
    mockUseFlag.mockReturnValue(false);
    mockHookResults.length = 0;
    mockHookResults.push(
      {
        id: 'arh',
        loading: false,
        error: null,
        hookResult: {
          manager: {
            model: 'Ask Red Hat',
            stateManager: createStateManager(),
            historyManagement: true,
            streamMessages: true,
            routes: ['/baz/*'],
          },
        },
      },
      {
        id: 'rhel',
        loading: false,
        error: null,
        hookResult: {
          manager: null,
        },
      },
      {
        id: 'ai',
        loading: false,
        error: 'An error occurred',
        hookResult: {
          manager: {
            model: 'AI Chatbot',
            stateManager: createStateManager(),
            historyManagement: false,
            streamMessages: false,
            routes: ['/ai/*'],
          },
        },
      }
    );
    (useLocation as jest.Mock).mockReturnValue({ pathname: '/foo/bar/baz' });
    const { result } = renderHook(() => useStateManager(true));
    await actWait();
    expect(result.current.currentModel).toBe('Ask Red Hat');
  }, 10000);

  it('registers ARH before VA when arh-default flag is ON', async () => {
    mockUseFlag.mockReturnValue(true);

    renderHook(() => useStateManager(true));
    await actWait();

    const modules = mockAddHook.mock.calls.map(([arg]: [{ module: string }]) => arg.module);
    const arhIndex = modules.indexOf('./useArhChatbot');
    const vaIndex = modules.indexOf('./useVaChatbot');
    expect(arhIndex).toBeGreaterThanOrEqual(0);
    expect(vaIndex).toBeGreaterThanOrEqual(0);
    expect(arhIndex).toBeLessThan(vaIndex);
  });

  it('registers VA before ARH when arh-default flag is OFF', async () => {
    mockUseFlag.mockReturnValue(false);

    renderHook(() => useStateManager(true));
    await actWait();

    const modules = mockAddHook.mock.calls.map(([arg]: [{ module: string }]) => arg.module);
    const arhIndex = modules.indexOf('./useArhChatbot');
    const vaIndex = modules.indexOf('./useVaChatbot');
    expect(arhIndex).toBeGreaterThanOrEqual(0);
    expect(vaIndex).toBeGreaterThanOrEqual(0);
    expect(vaIndex).toBeLessThan(arhIndex);
  });
});
