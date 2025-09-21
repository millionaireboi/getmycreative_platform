import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface CreativeElementProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  elementType: 'text' | 'image';
  textContent?: string;
  imageSrc?: string;
  isActive: boolean;
  isHovered: boolean;
}

const CreativeElement = forwardRef<HTMLButtonElement, CreativeElementProps>(
  (
    { label, elementType, textContent, imageSrc, isActive, isHovered, className = '', ...rest },
    ref,
  ) => {
    const stateClasses = [
      'creative-element',
      isActive ? 'creative-element--active' : '',
      isHovered ? 'creative-element--hovered' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button ref={ref} className={stateClasses} {...rest}>
        <span className="creative-element__label">{label}</span>
        <div className="creative-element__surface">
          {elementType === 'text' && textContent && (
            <p className="creative-element__text text-xs font-semibold leading-snug text-white mix-blend-difference drop-shadow">
              {textContent}
            </p>
          )}
          {elementType === 'image' && imageSrc && (
            <img className="creative-element__image" src={imageSrc} alt={`${label} preview`} />
          )}
        </div>
      </button>
    );
  },
);

CreativeElement.displayName = 'CreativeElement';

export default CreativeElement;
