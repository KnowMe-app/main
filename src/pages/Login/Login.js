import { LoginForm } from 'components/LoginForm/LoginForm';
import { useSelector } from 'react-redux';
import { selectError, selectLoading } from 'redux/auth/selectors';

export default function Login() {
  const error = useSelector(selectError);
  const isLoading = useSelector(selectLoading);
  return (
    <div>
      {isLoading ? <p>Loading is in progress...Wait a second please</p> : <LoginForm />}
      {error && <p>Please try again later. The problem occurred. ${error}</p>}
    </div>
  );
}
