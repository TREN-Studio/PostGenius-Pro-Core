import React from 'react';

const FloatingBox: React.FC = () => {
    return (
        <div className="hypercube-container" aria-hidden="true">
            <div className="hypercube">
                <div className="cube-face face-front"></div>
                <div className="cube-face face-back"></div>
                <div className="cube-face face-right"></div>
                <div className="cube-face face-left"></div>
                <div className="cube-face face-top"></div>
                <div className="cube-face face-bottom"></div>
                
                <div className="core-cube">
                    <div className="core-face core-front"></div>
                    <div className="core-face core-back"></div>
                    <div className="core-face core-right"></div>
                    <div className="core-face core-left"></div>
                    <div className="core-face core-top"></div>
                    <div className="core-face core-bottom"></div>
                </div>
                
                <div className="energy-core"></div>
            </div>
        </div>
    );
};

export default FloatingBox;