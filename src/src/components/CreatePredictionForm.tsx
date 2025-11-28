import { useState } from 'react';
import { Contract, type JsonRpcSigner } from 'ethers';

import { ZERO_TRUST_PREDICT_ABI, ZERO_TRUST_PREDICT_ADDRESS } from '../config/contracts';
import '../styles/CreatePredictionForm.css';

interface Props {
  signerPromise?: Promise<JsonRpcSigner>;
  onCreated: () => void;
}

export function CreatePredictionForm({ signerPromise, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  };

  const handleAddOption = () => {
    if (options.length >= 6) return;
    setOptions((prev) => [...prev, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!signerPromise) {
      alert('Connect a wallet to create predictions.');
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedOptions = options.map((opt) => opt.trim()).filter(Boolean);
    if (!trimmedTitle || trimmedOptions.length < 2) {
      alert('Enter a title and at least two option labels.');
      return;
    }

    setIsSubmitting(true);
    setFeedback('');
    try {
      const signer = await signerPromise;
      const contract = new Contract(ZERO_TRUST_PREDICT_ADDRESS, ZERO_TRUST_PREDICT_ABI, signer);
      const tx = await contract.createPrediction(trimmedTitle, trimmedOptions);
      await tx.wait();
      setTitle('');
      setOptions(['', '']);
      setFeedback('Prediction created successfully.');
      onCreated();
    } catch (error) {
      console.error(error);
      setFeedback('Failed to create prediction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="create-section">
      <div className="create-section__header">
        <div>
          <h2>Launch Prediction</h2>
          <p>Name your market and define between two and six encrypted options.</p>
        </div>
      </div>

      <form className="create-form" onSubmit={handleSubmit}>
        <label>
          <span>Prediction title</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. ETH price on Friday"
          />
        </label>

        <div className="options-list">
          <div className="options-list__header">
            <span>Options ({options.length}/6)</span>
            <button type="button" className="ghost-button" onClick={handleAddOption} disabled={options.length >= 6}>
              Add option
            </button>
          </div>

          {options.map((value, index) => (
            <div className="option-row" key={`option-${index}`}>
              <input
                type="text"
                value={value}
                onChange={(event) => handleOptionChange(index, event.target.value)}
                placeholder={`Option ${index + 1}`}
              />
              <button
                type="button"
                className="ghost-button"
                onClick={() => handleRemoveOption(index)}
                disabled={options.length <= 2}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Prediction'}
        </button>
        {feedback ? <p className="form-feedback">{feedback}</p> : null}
      </form>
    </section>
  );
}
