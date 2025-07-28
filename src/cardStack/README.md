# CardStack Example

This directory contains a simple swipeable card stack component written in **TypeScript** for React Native. It relies on `react-native-reanimated` and `react-native-gesture-handler` for smooth gestures and animations.

## Installation

```
npm install react-native-gesture-handler react-native-reanimated
```

Make sure to follow the additional installation steps for these libraries in the [React Native documentation](https://docs.swmansion.com/react-native-gesture-handler/docs/) and [Reanimated documentation](https://docs.swmansion.com/react-native-reanimated/).

## Usage

```
import { CardStack } from './cardStack/CardStack';
```

The `Example.tsx` component demonstrates how to render the stack with `mockUsers` data.

## Testing

Run Jest to execute unit tests for gesture utilities:

```
npm test
```
