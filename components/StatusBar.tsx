

import React from 'react';
import { AppStep } from '../types';

interface StatusBarProps {
  currentStep: AppStep;
  onStepClick: (step: AppStep) => void;
}

const steps = [
  { id: AppStep.BlueprintSelection, name: 'Blueprint' },
  { id: AppStep.Input, name: 'Input' },
  { id: AppStep.Generating, name: 'Generate' },
  { id: AppStep.Review, name: 'Review' },
  { id: AppStep.Publish, name: 'Publish' },
];

const StatusBar: React.FC<StatusBarProps> = ({ currentStep, onStepClick }) => {
  return (
    <nav aria-label="Progress">
      <ol role="list" className="flex items-center">
        {steps.map((step, stepIdx) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          
          const StepVisuals = (
            <div className="flex items-center text-sm font-medium">
              {/* Connector line */}
              {stepIdx > 0 && (
                <div className="absolute inset-0 right-1/2 -z-10">
                   <div className={`h-0.5 w-full ${isCompleted || isCurrent ? 'bg-accent' : 'bg-border-color'}`} />
                </div>
              )}
              
              {/* Step circle/indicator */}
              <div
                className={`
                  relative flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200
                  ${isCompleted ? 'bg-accent group-hover:scale-110' : ''}
                  ${isCurrent ? 'border-2 border-accent' : ''}
                  ${!isCompleted && !isCurrent ? 'border-2 border-border-color bg-background' : ''}
                `}
              >
                {isCompleted ? (
                  <svg className="h-5 w-5 text-background" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.052-.143z" clipRule="evenodd" />
                  </svg>
                ) : isCurrent ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-accent animate-pulse" />
                ) : null}
              </div>
              
              {/* Step Name */}
              <span
                className={`
                  ml-4 hidden sm:block font-medium transition-colors
                  ${isCurrent ? 'text-text-headings' : ''}
                  ${isCompleted ? 'text-text-primary group-hover:text-accent' : ''}
                  ${!isCompleted && !isCurrent ? 'text-text-secondary' : ''}
                `}
              >
                {step.name}
              </span>
            </div>
          );

          return (
            <li key={step.name} className="relative flex-1">
              {isCompleted ? (
                <button
                  onClick={() => onStepClick(step.id)}
                  className="group"
                  aria-label={`Go back to ${step.name} step`}
                >
                  {StepVisuals}
                </button>
              ) : (
                <div className="cursor-not-allowed">
                  {StepVisuals}
                </div>
              )}
               <div className="absolute top-10 text-xs sm:hidden font-medium text-center w-20 -left-8">
                   <span className={!isCompleted && !isCurrent ? 'text-text-secondary' : 'text-text-primary'}>
                       {step.name}
                   </span>
               </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default StatusBar;