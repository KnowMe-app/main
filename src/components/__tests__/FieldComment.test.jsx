import React from 'react';
import { createRoot } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';

jest.mock('../smallCard/actions', () => ({
  handleChange: jest.fn(),
  handleSubmit: jest.fn(),
}));

jest.mock('../../hooks/useAutoResize', () => ({
  useAutoResize: () => jest.fn(),
}));

import { FieldComment } from '../smallCard/FieldComment';
import { handleSubmit } from '../smallCard/actions';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('FieldComment', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    jest.clearAllMocks();
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  it('submits the current textarea value on blur', () => {
    const userData = { userId: 'user-1', myComment: 'Initial comment' };

    act(() => {
      root.render(
        <FieldComment
          userData={userData}
          setUsers={() => {}}
          setState={() => {}}
          isToastOn={true}
        />
      );
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();

    act(() => {
      Simulate.focus(textarea);
      Simulate.change(textarea, { target: { value: 'Updated comment' } });
      textarea.value = 'Updated comment';
      Simulate.blur(textarea);
    });

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', myComment: 'Updated comment' }),
      'overwrite',
      true,
    );
  });
});
