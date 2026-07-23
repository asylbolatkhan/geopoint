export default function FlagImg({ iso, size }) {
  const sizeConfig = {
    lg: 'w-40',
    md: 'w-24',
    sm: 'w-10',
  };

  const imgWidth = {
    lg: 'w160',
    md: 'w160',
    sm: 'w80',
  }[size] || 'w160';

  const className = `${sizeConfig[size] || 'w-24'} rounded-md shadow`;

  return (
    <img
      src={`https://flagcdn.com/${imgWidth}/${iso}.png`}
      alt=""
      className={className}
    />
  );
}
