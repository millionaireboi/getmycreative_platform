
import React from 'react';
import { Arrow } from 'react-konva';
import type { Connector, CanvasElement } from '../types.ts';
import { findElementAndAbsPosition } from '../utils/elementUtils.ts';

interface ConnectorComponentProps {
    connector: Connector;
    elements: CanvasElement[];
}

const ConnectorComponent: React.FC<ConnectorComponentProps> = ({ connector, elements }) => {
    // Fix: Corrected property access to match the Connector type ('fromBoard' instead of 'from').
    const fromResult = findElementAndAbsPosition(elements, connector.fromBoard);
    // Fix: Corrected property access to match the Connector type ('toBoard' instead of 'to').
    const toResult = findElementAndAbsPosition(elements, connector.toBoard);

    if (!fromResult || !toResult) return null;

    const fromHeight = fromResult.element.type === 'image' || fromResult.element.type === 'group' ? fromResult.element.height : 20;
    const toHeight = toResult.element.type === 'image' || toResult.element.type === 'group' ? toResult.element.height : 20;

    const fromCenter = {
        x: fromResult.absPos.x + fromResult.element.width / 2,
        y: fromResult.absPos.y + fromHeight / 2,
    };

    const toCenter = {
        x: toResult.absPos.x + toResult.element.width / 2,
        y: toResult.absPos.y + toHeight / 2,
    };
    
    return (
        <Arrow
            points={[fromCenter.x, fromCenter.y, toCenter.x, toCenter.y]}
            pointerLength={10}
            pointerWidth={10}
            fill="#A78BFA"
            stroke="#A78BFA"
            strokeWidth={2}
        />
    );
};

export default ConnectorComponent;
