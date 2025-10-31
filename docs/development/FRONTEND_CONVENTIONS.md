# Frontend Development Baseline Conventions

## 📋 Purpose

This document establishes baseline conventions and best practices for frontend development in all projects. These conventions ensure consistency, maintainability, and high-quality user experience across all frontend applications.

**Target Audience**: All frontend developers working on web and mobile applications.

---

## 🎯 Core Principles

1. **User First** - Always prioritize user experience and accessibility
2. **Validate Everything** - Never trust user input
3. **Performance Matters** - Optimize for speed and efficiency
4. **Consistency** - Follow established patterns and conventions
5. **Type Safety** - Leverage TypeScript to catch errors early

---

## ✅ User Input Validation

### General Rules

#### ✅ DO

- **Always validate user input** on both client and server side
- **Use debouncing** for validation during user input (500ms recommended)
- **Provide immediate feedback** for validation errors
- **Show clear error messages** that explain what went wrong and how to fix it
- **Validate on blur** for individual fields
- **Validate on submit** for the entire form
- **Disable submit button** when form has validation errors
- **Sanitize input** before displaying or sending to server
- **Use TypeScript types** to enforce data structure

#### ❌ DON'T

- **Never trust client-side validation alone** - always validate on server
- **Don't validate on every keystroke** without debouncing (causes poor UX)
- **Don't show error messages** before user finishes typing
- **Don't use generic error messages** like "Invalid input"
- **Don't allow form submission** with invalid data
- **Don't forget to validate hidden or disabled fields** if they're submitted

---

### Validation Patterns

#### 1. **Email Address Validation**

```typescript
// ✅ GOOD: Comprehensive email validation with debounce
import { debounce } from 'lodash';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');

const validateEmail = debounce((email: string, callback: (error: string | null) => void) => {
  try {
    emailSchema.parse(email);
    callback(null);
  } catch (error) {
    callback('Please enter a valid email address (e.g., user@example.com)');
  }
}, 500);

// Usage in React component
const [email, setEmail] = useState('');
const [emailError, setEmailError] = useState<string | null>(null);

const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = e.target.value;
  setEmail(value);
  
  if (value.trim()) {
    validateEmail(value, setEmailError);
  } else {
    setEmailError(null);
  }
};
```

```typescript
// ❌ BAD: No debounce, validates on every keystroke
const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = e.target.value;
  setEmail(value);
  
  // This will trigger on EVERY keystroke - poor UX
  if (!isValidEmail(value)) {
    setEmailError('Invalid email');
  }
};
```

#### 2. **Phone Number Validation**

```typescript
// ✅ GOOD: Format-aware phone validation
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

const validatePhoneNumber = debounce((phone: string, country: string, callback: (error: string | null) => void) => {
  try {
    if (!phone.trim()) {
      callback(null);
      return;
    }
    
    if (!isValidPhoneNumber(phone, country)) {
      callback(`Please enter a valid ${country} phone number`);
      return;
    }
    
    const phoneNumber = parsePhoneNumber(phone, country);
    callback(null);
  } catch (error) {
    callback('Please enter a valid phone number');
  }
}, 500);

// Usage
const [phone, setPhone] = useState('');
const [phoneError, setPhoneError] = useState<string | null>(null);

const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = e.target.value;
  setPhone(value);
  validatePhoneNumber(value, 'US', setPhoneError);
};
```

#### 3. **Number Validation (Amount, Price, Quantity)**

```typescript
// ✅ GOOD: Comprehensive number validation with range checks
const validateAmount = debounce((
  value: string,
  min: number,
  max: number,
  decimals: number,
  callback: (error: string | null) => void
) => {
  if (!value.trim()) {
    callback(null);
    return;
  }
  
  const number = parseFloat(value);
  
  if (isNaN(number)) {
    callback('Please enter a valid number');
    return;
  }
  
  if (number < min) {
    callback(`Amount must be at least ${min}`);
    return;
  }
  
  if (number > max) {
    callback(`Amount must not exceed ${max}`);
    return;
  }
  
  // Check decimal places
  const decimalPart = value.split('.')[1];
  if (decimalPart && decimalPart.length > decimals) {
    callback(`Maximum ${decimals} decimal places allowed`);
    return;
  }
  
  callback(null);
}, 500);

// Usage for trading amount
const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = e.target.value;
  setAmount(value);
  
  // Validate: min=0.01, max=1000000, decimals=2
  validateAmount(value, 0.01, 1000000, 2, setAmountError);
};
```

#### 4. **URL Validation**

```typescript
// ✅ GOOD: Proper URL validation
import { z } from 'zod';

const urlSchema = z.string().url('Please enter a valid URL');

const validateUrl = debounce((url: string, callback: (error: string | null) => void) => {
  if (!url.trim()) {
    callback(null);
    return;
  }
  
  try {
    urlSchema.parse(url);
    
    // Additional checks
    const parsedUrl = new URL(url);
    
    // Only allow https in production
    if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
      callback('Only HTTPS URLs are allowed');
      return;
    }
    
    callback(null);
  } catch (error) {
    callback('Please enter a valid URL (e.g., https://example.com)');
  }
}, 500);
```

#### 5. **Password Validation**

```typescript
// ✅ GOOD: Strong password validation with requirements
const passwordRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true,
};

const validatePassword = debounce((password: string, callback: (errors: string[]) => void) => {
  const errors: string[] = [];
  
  if (password.length < passwordRequirements.minLength) {
    errors.push(`At least ${passwordRequirements.minLength} characters`);
  }
  
  if (passwordRequirements.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('At least one uppercase letter');
  }
  
  if (passwordRequirements.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('At least one lowercase letter');
  }
  
  if (passwordRequirements.requireNumber && !/\d/.test(password)) {
    errors.push('At least one number');
  }
  
  if (passwordRequirements.requireSpecialChar && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('At least one special character');
  }
  
  callback(errors);
}, 300);

// Show requirements with checkmarks
const PasswordRequirements = ({ password }: { password: string }) => {
  const [errors, setErrors] = useState<string[]>([]);
  
  useEffect(() => {
    if (password) {
      validatePassword(password, setErrors);
    }
  }, [password]);
  
  return (
    <ul className="text-sm space-y-1">
      <li className={errors.includes('At least 8 characters') ? 'text-red-500' : 'text-green-500'}>
        {errors.includes('At least 8 characters') ? '✗' : '✓'} At least 8 characters
      </li>
      {/* More requirements */}
    </ul>
  );
};
```

#### 6. **Date/Time Validation**

```typescript
// ✅ GOOD: Date validation with business rules
import { isValid, parse, isFuture, isPast, differenceInYears } from 'date-fns';

const validateDate = debounce((
  dateString: string,
  minAge: number | null,
  allowFuture: boolean,
  callback: (error: string | null) => void
) => {
  if (!dateString.trim()) {
    callback(null);
    return;
  }
  
  const date = parse(dateString, 'yyyy-MM-dd', new Date());
  
  if (!isValid(date)) {
    callback('Please enter a valid date (YYYY-MM-DD)');
    return;
  }
  
  if (!allowFuture && isFuture(date)) {
    callback('Date cannot be in the future');
    return;
  }
  
  if (minAge !== null) {
    const age = differenceInYears(new Date(), date);
    if (age < minAge) {
      callback(`You must be at least ${minAge} years old`);
      return;
    }
  }
  
  callback(null);
}, 500);
```

---

## 🎛️ Form Handling Best Practices

### Form Submission

```typescript
// ✅ GOOD: Comprehensive form submission handling
const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  
  // Validate all fields
  const errors = validateAllFields(formData);
  if (Object.keys(errors).length > 0) {
    setFormErrors(errors);
    return;
  }
  
  // Disable submit button
  setIsSubmitting(true);
  
  try {
    // Sanitize data before submission
    const sanitizedData = sanitizeFormData(formData);
    
    // Submit to API
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitizedData),
    });
    
    if (!response.ok) {
      throw new Error('Submission failed');
    }
    
    // Show success message
    toast.success('Form submitted successfully');
    
    // Reset form
    resetForm();
  } catch (error) {
    // Show error message
    toast.error('Failed to submit form. Please try again.');
    console.error('Form submission error:', error);
  } finally {
    // Re-enable submit button
    setIsSubmitting(false);
  }
};
```

```typescript
// ❌ BAD: No validation, no error handling, no loading state
const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  
  // Directly submit without validation
  await fetch('/api/submit', {
    method: 'POST',
    body: JSON.stringify(formData),
  });
  
  // No error handling
  // No loading state
  // User can submit multiple times
};
```

### Form Libraries (Recommended)

```typescript
// ✅ GOOD: Using react-hook-form with Zod validation
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const formSchema = z.object({
  email: z.string().email('Invalid email address'),
  amount: z.number().min(0.01).max(1000000),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number'),
});

type FormData = z.infer<typeof formSchema>;

const MyForm = () => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });
  
  const onSubmit = async (data: FormData) => {
    // Data is already validated and typed
    await submitToApi(data);
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}
      
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
};
```

---

## ⚡ Performance Optimization

### Debouncing and Throttling

```typescript
// ✅ GOOD: Proper use of debounce and throttle
import { debounce, throttle } from 'lodash';

// Use DEBOUNCE for:
// - Search input (wait until user stops typing)
// - Form validation (wait until user finishes typing)
// - Auto-save (wait until user stops editing)
const debouncedSearch = debounce((query: string) => {
  searchAPI(query);
}, 500);

// Use THROTTLE for:
// - Scroll events (limit update frequency)
// - Resize events (limit recalculations)
// - Mouse move tracking (limit updates)
const throttledScroll = throttle(() => {
  updateScrollPosition();
}, 100);
```

```typescript
// ❌ BAD: No debouncing on expensive operations
const handleSearch = (query: string) => {
  // This hits the API on EVERY keystroke
  searchAPI(query);
};

const handleScroll = () => {
  // This runs on EVERY scroll event (can be 100+ times per second)
  updateScrollPosition();
};
```

### Component Optimization

```typescript
// ✅ GOOD: Memoization for expensive components
import { memo, useMemo, useCallback } from 'react';

const ExpensiveList = memo(({ items }: { items: Item[] }) => {
  return (
    <ul>
      {items.map(item => (
        <ExpensiveListItem key={item.id} item={item} />
      ))}
    </ul>
  );
});

// Use useMemo for expensive calculations
const sortedAndFilteredItems = useMemo(() => {
  return items
    .filter(item => item.active)
    .sort((a, b) => a.name.localeCompare(b.name));
}, [items]);

// Use useCallback for event handlers passed to child components
const handleItemClick = useCallback((id: string) => {
  selectItem(id);
}, []);
```

---

## ♿ Accessibility (a11y)

### Required Accessibility Practices

#### ✅ DO

- **Use semantic HTML** (`<button>`, `<nav>`, `<main>`, `<article>`, etc.)
- **Provide alt text** for all images
- **Use proper heading hierarchy** (h1 → h2 → h3)
- **Make interactive elements keyboard accessible** (Tab navigation)
- **Provide focus indicators** for keyboard navigation
- **Use ARIA labels** when semantic HTML is insufficient
- **Ensure sufficient color contrast** (WCAG AA: 4.5:1 for normal text)
- **Support screen readers** with descriptive labels
- **Make forms accessible** with proper labels and error announcements

#### ❌ DON'T

- **Don't use `<div>` with `onClick`** instead of `<button>`
- **Don't rely on color alone** to convey information
- **Don't remove focus outlines** without providing alternatives
- **Don't use placeholder text** as labels
- **Don't create keyboard traps**

```typescript
// ✅ GOOD: Accessible form with proper labels and ARIA
<form onSubmit={handleSubmit}>
  <label htmlFor="email">
    Email Address
    <span className="text-red-500" aria-label="required">*</span>
  </label>
  <input
    id="email"
    type="email"
    value={email}
    onChange={handleEmailChange}
    aria-invalid={!!emailError}
    aria-describedby={emailError ? 'email-error' : undefined}
    required
  />
  {emailError && (
    <span id="email-error" role="alert" className="text-red-500">
      {emailError}
    </span>
  )}
</form>
```

```typescript
// ❌ BAD: Inaccessible form
<form onSubmit={handleSubmit}>
  <input
    placeholder="Email"  // Placeholder is not a label
    value={email}
    onChange={handleEmailChange}
  />
  {emailError && <span style={{ color: 'red' }}>{emailError}</span>}
  {/* No label, no ARIA, relies on color only */}
</form>
```

---

## 🔒 Security Best Practices

### Input Sanitization

```typescript
// ✅ GOOD: Sanitize user input before display or storage
import DOMPurify from 'dompurify';

const sanitizeInput = (input: string): string => {
  // Remove HTML tags and potentially dangerous content
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
};

const sanitizeHTML = (html: string): string => {
  // Allow safe HTML tags only
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'title'],
  });
};
```

### XSS Prevention

```typescript
// ✅ GOOD: Safe rendering of user content
const UserComment = ({ comment }: { comment: string }) => {
  // React automatically escapes by default
  return <p>{comment}</p>;
};

// If you must render HTML (rare):
const UserCommentWithHTML = ({ html }: { html: string }) => {
  const sanitizedHTML = sanitizeHTML(html);
  return <div dangerouslySetInnerHTML={{ __html: sanitizedHTML }} />;
};
```

```typescript
// ❌ BAD: XSS vulnerability
const UserComment = ({ comment }: { comment: string }) => {
  // NEVER do this - allows script injection
  return <div dangerouslySetInnerHTML={{ __html: comment }} />;
};
```

### API Key Protection

```typescript
// ✅ GOOD: Never expose API keys in frontend
// Use environment variables on the server side
const response = await fetch('/api/data', {
  method: 'GET',
  // No API key sent from frontend
});

// In Next.js API route:
export async function GET() {
  const apiKey = process.env.API_KEY; // Only accessible on server
  const data = await externalAPI.fetch({ apiKey });
  return Response.json(data);
}
```

```typescript
// ❌ BAD: Exposing API keys
const API_KEY = 'sk_live_abc123...'; // NEVER hardcode keys

const response = await fetch('https://api.example.com/data', {
  headers: {
    'Authorization': `Bearer ${API_KEY}`, // Key exposed to users
  },
});
```

---

## 🎨 UI/UX Best Practices

### Loading States

```typescript
// ✅ GOOD: Clear loading states
const DataTable = () => {
  const [data, setData] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    fetchData()
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (error) {
    return <ErrorMessage message={error} onRetry={refetch} />;
  }
  
  if (data.length === 0) {
    return <EmptyState message="No data available" />;
  }
  
  return <Table data={data} />;
};
```

### Error Handling

```typescript
// ✅ GOOD: User-friendly error messages
const ErrorMessage = ({ error }: { error: Error }) => {
  const getUserFriendlyMessage = (error: Error): string => {
    if (error.message.includes('network')) {
      return 'Unable to connect. Please check your internet connection.';
    }
    if (error.message.includes('401')) {
      return 'Please log in to continue.';
    }
    if (error.message.includes('403')) {
      return 'You don\'t have permission to access this resource.';
    }
    return 'Something went wrong. Please try again later.';
  };
  
  return (
    <div className="error-message">
      <AlertCircle className="icon" />
      <p>{getUserFriendlyMessage(error)}</p>
      <button onClick={retry}>Try Again</button>
    </div>
  );
};
```

```typescript
// ❌ BAD: Raw error messages shown to users
const ErrorMessage = ({ error }: { error: Error }) => {
  return (
    <div>
      {error.message} {/* "TypeError: Cannot read property 'data' of undefined" */}
    </div>
  );
};
```

### Button States

```typescript
// ✅ GOOD: Clear button states
<button
  onClick={handleSubmit}
  disabled={isSubmitting || hasErrors}
  className={cn(
    'btn-primary',
    isSubmitting && 'opacity-50 cursor-not-allowed'
  )}
>
  {isSubmitting ? (
    <>
      <Loader className="animate-spin" />
      Submitting...
    </>
  ) : (
    'Submit'
  )}
</button>
```

---

## 📝 Code Quality Standards

### TypeScript Usage

```typescript
// ✅ GOOD: Proper typing
interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

const fetchUser = async (userId: string): Promise<User> => {
  const response = await fetch(`/api/users/${userId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }
  return response.json();
};

const UserProfile = ({ userId }: { userId: string }) => {
  const [user, setUser] = useState<User | null>(null);
  
  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);
  
  if (!user) return <LoadingSpinner />;
  
  return <div>{user.name}</div>;
};
```

```typescript
// ❌ BAD: Using 'any' everywhere
const fetchUser = async (userId: any): Promise<any> => {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
};

const UserProfile = ({ userId }: any) => {
  const [user, setUser] = useState<any>(null);
  // TypeScript can't help catch errors
};
```

### Error Boundaries

```typescript
// ✅ GOOD: Proper error boundaries
import { ErrorBoundary } from 'react-error-boundary';

const ErrorFallback = ({ error, resetErrorBoundary }: any) => {
  return (
    <div role="alert">
      <h2>Something went wrong</h2>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
};

const App = () => {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Reset app state
      }}
    >
      <MyComponent />
    </ErrorBoundary>
  );
};
```

---

## 🧪 Testing Requirements

### Component Testing

```typescript
// ✅ GOOD: Comprehensive component tests
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('LoginForm', () => {
  it('validates email format', async () => {
    render(<LoginForm />);
    
    const emailInput = screen.getByLabelText('Email');
    await userEvent.type(emailInput, 'invalid-email');
    
    fireEvent.blur(emailInput);
    
    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });
  });
  
  it('disables submit button when form is invalid', () => {
    render(<LoginForm />);
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    expect(submitButton).toBeDisabled();
  });
  
  it('submits form with valid data', async () => {
    const onSubmit = jest.fn();
    render(<LoginForm onSubmit={onSubmit} />);
    
    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'SecurePass123!');
    
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'SecurePass123!',
      });
    });
  });
});
```

---

## 📦 Recommended Libraries

### Validation

- **Zod** - Schema validation with TypeScript inference
- **Yup** - Alternative schema validation
- **Validator.js** - String validation utilities
- **libphonenumber-js** - Phone number validation

### Forms

- **react-hook-form** - Performant form library (recommended)
- **Formik** - Alternative form library
- **@hookform/resolvers** - Validation resolver for react-hook-form

### Utilities

- **lodash** - Debounce, throttle, and utility functions
- **date-fns** - Date manipulation and validation
- **DOMPurify** - HTML sanitization

### UI/UX

- **react-hot-toast** - Toast notifications (lightweight)
- **sonner** - Toast notifications (alternative)
- **framer-motion** - Animations

### Testing

- **@testing-library/react** - Component testing
- **@testing-library/user-event** - User interaction simulation
- **vitest** - Fast test runner

---

## 🚫 Common Mistakes to Avoid

### 1. **No Validation on Client Side**

```typescript
// ❌ BAD
<button onClick={() => submitForm()}>Submit</button>
// No validation before submission
```

### 2. **Validating Too Frequently**

```typescript
// ❌ BAD
<input onChange={e => validateEmail(e.target.value)} />
// Validates on every keystroke without debounce
```

### 3. **Poor Error Messages**

```typescript
// ❌ BAD
{error && <span>Error</span>}
// Not helpful

// ✅ GOOD
{error && <span>Please enter a valid email address (e.g., user@example.com)</span>}
```

### 4. **No Loading States**

```typescript
// ❌ BAD
const data = await fetchData();
return <DataTable data={data} />;
// User sees blank screen during loading

// ✅ GOOD
if (isLoading) return <LoadingSpinner />;
return <DataTable data={data} />;
```

### 5. **Ignoring Accessibility**

```typescript
// ❌ BAD
<div onClick={handleClick}>Click me</div>
// Not keyboard accessible, not semantic

// ✅ GOOD
<button onClick={handleClick}>Click me</button>
```

### 6. **Hardcoding Values**

```typescript
// ❌ BAD
const API_URL = 'https://api.production.com';

// ✅ GOOD
const API_URL = process.env.NEXT_PUBLIC_API_URL;
```

### 7. **No Error Handling**

```typescript
// ❌ BAD
const data = await fetch('/api/data').then(r => r.json());

// ✅ GOOD
try {
  const response = await fetch('/api/data');
  if (!response.ok) throw new Error('Failed to fetch');
  const data = await response.json();
} catch (error) {
  handleError(error);
}
```

---

## 📋 Checklist for Code Review

Before submitting a PR, verify:

- [ ] All user inputs are validated (client and server)
- [ ] Validation uses debouncing (500ms recommended)
- [ ] Error messages are clear and helpful
- [ ] Forms have loading states during submission
- [ ] Submit buttons are disabled when form is invalid or submitting
- [ ] All inputs have proper labels (no placeholder-only labels)
- [ ] Interactive elements are keyboard accessible
- [ ] Focus indicators are visible
- [ ] Color contrast meets WCAG AA standards
- [ ] TypeScript types are properly defined (no `any`)
- [ ] Error boundaries are implemented
- [ ] Loading and error states are handled
- [ ] API keys are not exposed in frontend code
- [ ] User input is sanitized before display
- [ ] Components are tested with unit tests
- [ ] Code follows ESLint and Prettier conventions

---

## 🔄 Review and Updates

This document should be reviewed and updated:

- **Quarterly** - Review all conventions and update based on new learnings
- **After major incidents** - Document lessons learned
- **When adopting new technologies** - Update recommended libraries and patterns
- **Based on team feedback** - Incorporate suggestions from developers

---

## 📚 Additional Resources

- [React Official Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Web Content Accessibility Guidelines (WCAG)](https://www.w3.org/WAI/WCAG21/quickref/)
- [OWASP Top Ten](https://owasp.org/www-project-top-ten/)
- [React Hook Form Documentation](https://react-hook-form.com/)
- [Zod Documentation](https://zod.dev/)

---

**Remember**: These conventions are guidelines to ensure consistency and quality. When in doubt, prioritize user experience, security, and maintainability.

---
