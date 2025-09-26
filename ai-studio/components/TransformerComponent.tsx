
import React from 'react';
import { Transformer } from 'react-konva';
import type Konva from 'konva';

const TransformerComponent = React.forwardRef<Konva.Transformer>((props, ref) => {
    return (
        <Transformer
            ref={ref}
            boundBoxFunc={(oldBox, newBox) => {
                // limit resize
                if (newBox.width < 5 || newBox.height < 5) {
                    return oldBox;
                }
                return newBox;
            }}
            anchorStroke="#A78BFA"
            anchorFill="#A78BFA"
            anchorSize={10}
            borderStroke="#A78BFA"
            borderDash={[6, 2]}
            rotateAnchorOffset={30}
        />
    );
});

TransformerComponent.displayName = 'TransformerComponent';

export default TransformerComponent;
