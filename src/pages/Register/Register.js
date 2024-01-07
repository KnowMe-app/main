import { RegisterForm } from 'components/RegisterForm/RegisterForm';
import { useSelector } from 'react-redux';
import { selectError, selectLoading } from 'redux/auth/selectors';

export default function Register() {
  const error = useSelector(selectError);
  const isLoading = useSelector(selectLoading);
  return (
    <div>
      {isLoading ? <p>Registration and loading are in progress...Wait a second please</p> : <RegisterForm />}
      {error && <p>Please try again later. The problem occurred. ${error}</p>}
    </div>
  );
}
